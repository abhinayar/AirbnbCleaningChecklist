import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildReportPdf } from "@/lib/pdf";
import { sendReportEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Finalize a run: build the PDF from all item results + photos, email it to the
// configured recipients, mark the run complete, and discard the stored photos.
export async function POST(
  _req: NextRequest,
  { params }: { params: { runId: string } },
) {
  const { runId } = params;

  const run = await prisma.cleaningRun.findUnique({
    where: { id: runId },
    include: {
      property: true,
      results: { include: { item: true } },
    },
  });

  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "completed") {
    return NextResponse.json({ error: "Run already completed." }, { status: 409 });
  }

  // Order results by their checklist item order.
  const results = [...run.results].sort((a, b) => a.item.order - b.item.order);
  if (results.length === 0) {
    return NextResponse.json(
      { error: "No photos have been submitted for this run yet." },
      { status: 400 },
    );
  }

  const completedAt = new Date();

  const pdf = await buildReportPdf({
    propertyName: run.property.name,
    propertyAddress: run.property.address,
    cleanerName: run.cleanerName,
    completedAt,
    items: results.map((r) => ({
      title: r.item.title,
      tips: r.item.tips,
      qcPrompt: r.item.qcPrompt,
      blurry: r.blurry,
      pass: r.qcPass,
      confidence: r.qcConfidence,
      notes: r.qcNotes,
      photo: r.photo ? Buffer.from(r.photo) : null,
    })),
  });

  const dateStr = completedAt.toISOString().slice(0, 10);
  const safeName = run.property.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `cleaning-${safeName}-${dateStr}.pdf`;
  const passed = results.filter((r) => r.qcPass).length;

  let sentTo: string[];
  try {
    ({ sentTo } = await sendReportEmail({
      subject: `Cleaning report — ${run.property.name} (${dateStr})`,
      pdf,
      filename,
      intro:
        `Cleaning report for ${run.property.name}` +
        (run.cleanerName ? `, cleaned by ${run.cleanerName}` : "") +
        `.\n${passed} of ${results.length} items passed QC.\nThe full report with photos is attached.`,
    }));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to send report email." },
      { status: 500 },
    );
  }

  // Mark complete and discard the stored photos (PDF is now the record).
  await prisma.cleaningRun.update({
    where: { id: runId },
    data: { status: "completed", completedAt, reportSent: true },
  });
  await prisma.itemResult.updateMany({ where: { runId }, data: { photo: null } });

  return NextResponse.json({ ok: true, sentTo, passed, total: results.length });
}
