import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReportPdf, PdfArea } from "@/lib/pdf";
import { sendReportEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Finalize a run: build the PDF (grouped by area, noting skipped rooms), email
// it to recipients, mark the run complete, and discard the stored photos.
export async function POST(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params;

  const run = await prisma.cleaningRun.findUnique({
    where: { id: runId },
    include: {
      property: {
        include: {
          areas: {
            orderBy: { order: "asc" },
            include: { items: { orderBy: { order: "asc" } } },
          },
        },
      },
      results: true,
      roomSkips: true,
    },
  });

  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "completed") {
    return NextResponse.json({ error: "Run already completed." }, { status: 409 });
  }

  const resultByItem = new Map(run.results.map((r) => [r.itemId, r]));
  const skipByArea = new Map(run.roomSkips.map((s) => [s.areaId, s]));
  const areas = run.property.areas.filter((a) => a.items.length > 0);

  // Validate: every non-skipped area must have all required items photographed.
  const missing: string[] = [];
  for (const area of areas) {
    if (skipByArea.has(area.id)) continue;
    for (const item of area.items) {
      if (item.requiresPhoto && !resultByItem.has(item.id)) {
        missing.push(`${area.name} — ${item.title}`);
      }
    }
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing photos for: ${missing.join("; ")}` },
      { status: 400 },
    );
  }

  const completedAt = new Date();
  const isTest = run.cleanerName === "Abhi";

  const pdfAreas: PdfArea[] = areas.map((area) => {
    const skip = skipByArea.get(area.id);
    return {
      name: area.name,
      kind: area.kind,
      skippedReason: skip ? skip.reason : null,
      items: skip
        ? []
        : area.items.map((item) => {
            const r = resultByItem.get(item.id);
            return {
              title: item.title,
              tips: item.tips,
              qcPrompt: item.qcPrompt,
              requiresPhoto: item.requiresPhoto,
              qcSkipped: isTest,
              blurry: r?.blurry ?? null,
              pass: r?.qcPass ?? null,
              confidence: r?.qcConfidence ?? null,
              notes: r?.qcNotes ?? null,
              photo: r?.photo ? Buffer.from(r.photo) : null,
            };
          }),
    };
  });

  const pdf = await buildReportPdf({
    propertyName: run.property.name,
    propertyAddress: run.property.address,
    cleanerName: run.cleanerName,
    completedAt,
    testMode: isTest,
    areas: pdfAreas,
  });

  const allResults = run.results;
  const passed = allResults.filter((r) => r.qcPass).length;
  const total = allResults.length;
  const skippedRooms = run.roomSkips.length;

  const dateStr = completedAt.toISOString().slice(0, 10);
  const safeName = run.property.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `cleaning-${safeName}-${dateStr}.pdf`;

  let sentTo: string[];
  try {
    ({ sentTo } = await sendReportEmail({
      subject: `Cleaning report — ${run.property.name} (${dateStr})`,
      pdf,
      filename,
      intro:
        `Cleaning report for ${run.property.name}` +
        (run.cleanerName ? `, cleaned by ${run.cleanerName}` : "") +
        `.\n${passed} of ${total} photographed items passed QC.` +
        (skippedRooms > 0 ? `\n${skippedRooms} room(s) were not cleaned.` : "") +
        `\nThe full report with photos is attached.`,
    }));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send report email." },
      { status: 500 },
    );
  }

  await prisma.cleaningRun.update({
    where: { id: runId },
    data: { status: "completed", completedAt, reportSent: true },
  });
  await prisma.itemResult.updateMany({ where: { runId }, data: { photo: null } });

  return NextResponse.json({ ok: true, sentTo, passed, total, skippedRooms });
}
