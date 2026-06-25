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
    where: { id: itemId, propertyId: run.propertyId },
  });
  if (!item) {
    return NextResponse.json({ error: "Checklist item not found." }, { status: 404 });
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

  const result = await runQc(jpeg, item.title, item.qcPrompt);

  await prisma.itemResult.upsert({
    where: { runId_itemId: { runId, itemId } },
    create: {
      runId,
      itemId,
      photo: jpeg,
      blurry: result.blurry,
      qcPass: result.pass,
      qcConfidence: result.confidence,
      qcNotes: result.notes,
      aiRaw: JSON.stringify(result),
    },
    update: {
      photo: jpeg,
      blurry: result.blurry,
      qcPass: result.pass,
      qcConfidence: result.confidence,
      qcNotes: result.notes,
      aiRaw: JSON.stringify(result),
    },
  });

  return NextResponse.json({ result });
}
