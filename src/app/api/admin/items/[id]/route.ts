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
  if (typeof body?.title === "string") data.title = body.title.trim();
  if (typeof body?.qcPrompt === "string") data.qcPrompt = body.qcPrompt.trim();
  if (typeof body?.tips === "string") data.tips = body.tips.trim() || null;
  if (typeof body?.requiresPhoto === "boolean") data.requiresPhoto = body.requiresPhoto;
  if (typeof body?.order === "number") data.order = body.order;

  const item = await prisma.checklistItem.update({
    where: { id: params.id },
    data,
  });
  return NextResponse.json({ item });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await prisma.checklistItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
