import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof body?.name === "string") data.name = body.name.trim();
  if (typeof body?.address === "string") data.address = body.address.trim() || null;
  if (typeof body?.pin === "string") data.pin = body.pin.trim();
  if (typeof body?.active === "boolean") data.active = body.active;

  const property = await prisma.property.update({
    where: { id: params.id },
    data,
    include: { items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ property });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.property.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
