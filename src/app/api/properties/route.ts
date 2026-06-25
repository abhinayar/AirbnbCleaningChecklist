import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: list active properties for the cleaner picker.
export async function GET() {
  const properties = await prisma.property.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, address: true },
  });
  return NextResponse.json({ properties });
}
