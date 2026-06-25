import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Create a checklist item under an area.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const areaId = body?.areaId as string | undefined;
  const title = (body?.title as string | undefined)?.trim();
  const qcPrompt = (body?.qcPrompt as string | undefined)?.trim();
  const tips = (body?.tips as string | undefined)?.trim() || null;
  const requiresPhoto = body?.requiresPhoto !== false;

  if (!areaId || !title || !qcPrompt) {
    return NextResponse.json(
      { error: "areaId, title, and qcPrompt are required." },
      { status: 400 },
    );
  }

  const count = await prisma.checklistItem.count({ where: { areaId } });
  const item = await prisma.checklistItem.create({
    data: { areaId, title, qcPrompt, tips, requiresPhoto, order: count + 1 },
  });
  return NextResponse.json({ item });
}
