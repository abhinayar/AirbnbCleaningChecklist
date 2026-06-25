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
  if (body?.kind === "common" || body?.kind === "room") data.kind = body.kind;
  if (typeof body?.order === "number") data.order = body.order;

  const area = await prisma.area.update({
    where: { id: params.id },
    data,
    include: { items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ area });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.area.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
