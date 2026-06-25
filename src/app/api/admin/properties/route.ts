import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List all properties with their checklist items (admin view).
export async function GET() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const properties = await prisma.property.findMany({
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { order: "asc" } } },
  });
  return NextResponse.json({ properties });
}

// Create a property.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const name = (body?.name as string | undefined)?.trim();
  const address = (body?.address as string | undefined)?.trim() || null;
  const pin = (body?.pin as string | undefined)?.trim();

  if (!name || !pin) {
    return NextResponse.json({ error: "Name and PIN are required." }, { status: 400 });
  }

  const property = await prisma.property.create({
    data: { name, address, pin },
    include: { items: true },
  });
  return NextResponse.json({ property });
}
