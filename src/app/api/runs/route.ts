import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Start a cleaning run after verifying the property PIN.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const propertyId = body?.propertyId as string | undefined;
  const pin = (body?.pin as string | undefined)?.trim();
  const cleanerName = (body?.cleanerName as string | undefined)?.trim() || null;

  if (!propertyId || !pin) {
    return NextResponse.json({ error: "Missing propertyId or pin." }, { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: { items: { orderBy: { order: "asc" } } },
  });

  if (!property || !property.active) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }
  if (property.pin !== pin) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }
  if (property.items.length === 0) {
    return NextResponse.json(
      { error: "This property has no checklist items yet." },
      { status: 400 },
    );
  }

  const run = await prisma.cleaningRun.create({
    data: { propertyId: property.id, cleanerName },
  });

  return NextResponse.json({
    runId: run.id,
    property: { id: property.id, name: property.name, address: property.address },
    items: property.items.map((i) => ({
      id: i.id,
      title: i.title,
      tips: i.tips,
      qcPrompt: i.qcPrompt,
      requiresPhoto: i.requiresPhoto,
    })),
  });
}
