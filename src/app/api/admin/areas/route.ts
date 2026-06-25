import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create an area (common | room) under a property.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const propertyId = body?.propertyId as string | undefined;
  const name = (body?.name as string | undefined)?.trim();
  const kind = body?.kind === "common" ? "common" : "room";

  if (!propertyId || !name) {
    return NextResponse.json(
      { error: "propertyId and name are required." },
      { status: 400 },
    );
  }

  const count = await prisma.area.count({ where: { propertyId } });
  const area = await prisma.area.create({
    data: { propertyId, name, kind, order: count + 1 },
    include: { items: true },
  });
  return NextResponse.json({ area });
}
