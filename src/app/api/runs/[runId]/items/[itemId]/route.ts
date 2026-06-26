import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePhoto } from "@/lib/image";
import { runQc } from "@/lib/qc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // QC vision call can take a few seconds

// Upload a photo for one checklist item, normalize it, run the AI QC check,
// store the result (+ normalized photo), and return the verdict.
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string; itemId: string } },
) {
  const { runId, itemId } = params;

  const run = await prisma.cleaningRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "completed") {
    return NextResponse.json({ error: "This run is already complete." }, { status: 409 });
  }

  const item = await prisma.checklistItem.findFirst({
    where: { id: itemId, area: { propertyId: run.propertyId } },
  });
  if (!item) {
    return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
  }

  // Don't accept photos for a room the cleaner marked as not cleaned.
  const skipped = await prisma.roomSkip.findUnique({
    where: { runId_areaId: { runId, areaId: item.areaId } },
  });
  if (skipped) {
    return NextResponse.json(
      { error: "This room is marked as not cleaned. Unmark it to add photos." },
      { status: 409 },
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No photo uploaded." }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  if (inputBuffer.length === 0) {
    return NextResponse.json({ error: "Empty photo." }, { status: 400 });
  }

  let jpeg: Buffer;
  try {
    jpeg = (await normalizePhoto(inputBuffer)).buffer;
  } catch {
    return NextResponse.json(
      { error: "Could not read that image. Try taking the photo again." },
      { status: 400 },
    );
  }

  // Test account: capture the photo but skip the AI QC check entirely.
  const isTest = run.cleanerName === "Abhi";

  const result = isTest
    ? { blurry: false, pass: false, confidence: 0, notes: "", qcSkipped: true }
    : await runQc(jpeg, item.title, item.qcPrompt);

  await prisma.itemResult.upsert({
    where: { runId_itemId: { runId, itemId } },
    create: {
      runId,
      itemId,
      photo: jpeg,
      blurry: isTest ? null : result.blurry,
      qcPass: isTest ? null : result.pass,
      qcConfidence: isTest ? null : result.confidence,
      qcNotes: isTest ? null : result.notes,
      aiRaw: isTest ? JSON.stringify({ qcSkipped: true }) : JSON.stringify(result),
    },
    update: {
      photo: jpeg,
      blurry: isTest ? null : result.blurry,
      qcPass: isTest ? null : result.pass,
      qcConfidence: isTest ? null : result.confidence,
      qcNotes: isTest ? null : result.notes,
      aiRaw: isTest ? JSON.stringify({ qcSkipped: true }) : JSON.stringify(result),
    },
  });

  return NextResponse.json({ result });
}
