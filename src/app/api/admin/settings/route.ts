import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, recipients: process.env.REPORT_RECIPIENTS ?? "" },
  });
  return NextResponse.json({
    settings,
    envFallbackRecipients: process.env.REPORT_RECIPIENTS ?? "",
    envFrom: process.env.RESEND_FROM ?? "",
  });
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const recipients = (body?.recipients as string | undefined) ?? "";
  const fromEmail = (body?.fromEmail as string | undefined)?.trim() || null;

  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: { recipients, fromEmail },
    create: { id: 1, recipients, fromEmail },
  });
  return NextResponse.json({ settings });
}
