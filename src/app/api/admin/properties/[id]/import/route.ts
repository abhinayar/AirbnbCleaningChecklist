import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAdminAuthed } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ImportItem = {
  title?: string;
  tips?: string;
  qcPrompt?: string;
  requiresPhoto?: boolean;
};
type ImportArea = {
  name?: string;
  kind?: string;
  items?: ImportItem[];
};

// Bulk-add areas + checklist items to a property from a JSON payload.
// Body: { areas: [{ name, kind: "common"|"room", items: [{ title, tips?, qcPrompt }] }] }
// Areas are appended; existing areas/items are left untouched.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const property = await prisma.property.findUnique({ where: { id: params.id } });
  if (!property) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const areas = body?.areas as ImportArea[] | undefined;
  if (!Array.isArray(areas) || areas.length === 0) {
    return NextResponse.json(
      { error: 'Expected { "areas": [ ... ] } with at least one area.' },
      { status: 400 },
    );
  }

  let areaOrder = await prisma.area.count({ where: { propertyId: params.id } });
  let createdAreas = 0;
  let createdItems = 0;

  for (const area of areas) {
    const name = area?.name?.trim();
    if (!name) continue;
    const kind = area.kind === "common" ? "common" : "room";
    // An item needs a title; a QC prompt is only required when it needs a photo.
    const validItems = (area.items ?? []).filter((it) => {
      if (!it?.title?.trim()) return false;
      const needsPhoto = it.requiresPhoto !== false;
      return !needsPhoto || !!it.qcPrompt?.trim();
    });
    if (validItems.length === 0) continue;

    areaOrder += 1;
    await prisma.area.create({
      data: {
        propertyId: params.id,
        name,
        kind,
        order: areaOrder,
        items: {
          create: validItems.map((it, idx) => ({
            order: idx + 1,
            title: it.title!.trim(),
            tips: it.tips?.trim() || null,
            qcPrompt: it.qcPrompt?.trim() || "",
            requiresPhoto: it.requiresPhoto !== false,
          })),
        },
      },
    });
    createdAreas += 1;
    createdItems += validItems.length;
  }

  if (createdAreas === 0) {
    return NextResponse.json(
      { error: "No valid areas/items found. Each item needs a title and qcPrompt." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, createdAreas, createdItems });
}
