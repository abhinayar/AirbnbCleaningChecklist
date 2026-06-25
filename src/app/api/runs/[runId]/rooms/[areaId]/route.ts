import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mark a room (area) as not cleaned for this run, or unmark it.
// Body: { skipped: boolean, reason?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: { runId: string; areaId: string } },
) {
  const { runId, areaId } = params;

  const run = await prisma.cleaningRun.findUnique({ where: { id: runId } });
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  if (run.status === "completed") {
    return NextResponse.json({ error: "This run is already complete." }, { status: 409 });
  }

  const area = await prisma.area.findFirst({
    where: { id: areaId, propertyId: run.propertyId },
  });
  if (!area) return NextResponse.json({ error: "Room not found." }, { status: 404 });
  if (area.kind !== "room") {
    return NextResponse.json(
      { error: "Only rooms can be skipped — common areas are required daily." },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const skipped = Boolean(body?.skipped);
  const reason = (body?.reason as string | undefined)?.trim() || "Occupied";

  if (skipped) {
    // Marking a room as not cleaned: clear any photos already taken for it.
    const items = await prisma.checklistItem.findMany({
      where: { areaId },
      select: { id: true },
    });
    const itemIds = items.map((i) => i.id);
    if (itemIds.length > 0) {
      await prisma.itemResult.deleteMany({
        where: { runId, itemId: { in: itemIds } },
      });
    }
    await prisma.roomSkip.upsert({
      where: { runId_areaId: { runId, areaId } },
      create: { runId, areaId, reason },
      update: { reason },
    });
    return NextResponse.json({ skipped: true, reason });
  }

  await prisma.roomSkip.deleteMany({ where: { runId, areaId } });
  return NextResponse.json({ skipped: false });
}
