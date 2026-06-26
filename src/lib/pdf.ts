import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

export type PdfItem = {
  title: string;
  tips?: string | null;
  qcPrompt: string;
  requiresPhoto: boolean;
  qcSkipped?: boolean; // test run — photo captured, no AI QC
  blurry: boolean | null;
  pass: boolean | null;
  confidence: number | null;
  notes: string | null;
  photo: Buffer | null; // normalized JPEG
};

export type PdfArea = {
  name: string;
  kind: string; // "common" | "room"
  skippedReason?: string | null; // set when a room was not cleaned
  items: PdfItem[];
};

export type PdfInput = {
  propertyName: string;
  propertyAddress?: string | null;
  cleanerName?: string | null;
  completedAt: Date;
  testMode?: boolean;
  areas: PdfArea[];
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;

const GREEN = rgb(0.13, 0.6, 0.3);
const RED = rgb(0.83, 0.16, 0.18);
const AMBER = rgb(0.85, 0.55, 0.1);
const GRAY = rgb(0.4, 0.4, 0.4);
const DARK = rgb(0.1, 0.1, 0.1);

function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildReportPdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawLines = (
    text: string,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 11;
    const color = opts.color ?? DARK;
    const gap = opts.gap ?? 4;
    const lines = wrapText(text, f, size, CONTENT_W);
    for (const line of lines) {
      ensureSpace(size + gap);
      page.drawText(line, { x: MARGIN, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };

  // ---- Header ----
  drawLines(input.propertyName, { font: bold, size: 20, gap: 6 });
  if (input.propertyAddress) {
    drawLines(input.propertyAddress, { size: 11, color: GRAY, gap: 4 });
  }
  drawLines(`Cleaning report • ${input.completedAt.toLocaleString()}`, {
    size: 11,
    color: GRAY,
    gap: 4,
  });
  drawLines(`Cleaned by: ${input.cleanerName || "Unknown"}`, {
    font: bold,
    size: 13,
    color: DARK,
    gap: 8,
  });

  const photoItems = input.areas.flatMap((a) => a.items).filter((i) => i.requiresPhoto);
  // Only count items that actually got an AI verdict (exclude test/QC-skipped).
  const verdictItems = photoItems.filter((i) => !i.qcSkipped);
  const passed = verdictItems.filter((i) => i.pass).length;
  const skippedRooms = input.areas.filter((a) => a.skippedReason).length;
  const roomNote = skippedRooms > 0 ? `  •  ${skippedRooms} room(s) not cleaned` : "";
  if (input.testMode || verdictItems.length === 0) {
    drawLines("Photos captured — automated QC not run" + roomNote, {
      font: bold,
      size: 12,
      color: GRAY,
      gap: 10,
    });
  } else {
    drawLines(`${passed} of ${verdictItems.length} photo checks passed QC` + roomNote, {
      font: bold,
      size: 12,
      color: passed === verdictItems.length ? GREEN : AMBER,
      gap: 10,
    });
  }

  // divider
  ensureSpace(12);
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 1,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 16;

  // ---- Areas & items ----
  for (const area of input.areas) {
    ensureSpace(30);
    const areaLabel =
      area.kind === "common" ? `${area.name} (daily)` : area.name;
    drawLines(areaLabel, { font: bold, size: 15, color: rgb(0.2, 0.2, 0.4), gap: 4 });

    if (area.skippedReason) {
      drawLines(`Not cleaned — ${area.skippedReason}`, {
        font: bold,
        size: 11,
        color: AMBER,
        gap: 12,
      });
      continue;
    }

    for (let idx = 0; idx < area.items.length; idx++) {
      const item = area.items[idx];

      ensureSpace(40);
      drawLines(`${idx + 1}. ${item.title}`, { font: bold, size: 13, gap: 6 });

    if (!item.requiresPhoto) {
      // Reminder-only item — no photo / QC.
      drawLines("No photo required", { font: bold, size: 11, color: GRAY, gap: 5 });
      if (item.tips) {
        drawLines(`Tips: ${item.tips}`, { size: 10, color: GRAY, gap: 4 });
      }
      y -= 6;
      continue;
    }

    // Status badge line (skipped entirely for test-run photos)
    if (item.qcSkipped) {
      drawLines("Photo captured — automated QC not run", {
        font: bold,
        size: 11,
        color: GRAY,
        gap: 5,
      });
    } else {
      const status = item.blurry
        ? "BLURRY — needs a clearer photo"
        : item.pass
          ? "PASS"
          : "FAIL";
      const statusColor = item.blurry ? AMBER : item.pass ? GREEN : RED;
      const conf =
        item.confidence != null
          ? `  (confidence ${Math.round(item.confidence * 100)}%)`
          : "";
      drawLines(`Status: ${status}${conf}`, {
        font: bold,
        size: 11,
        color: statusColor,
        gap: 5,
      });
      if (item.qcPrompt) {
        drawLines(`Checked for: ${item.qcPrompt}`, { size: 10, color: GRAY, gap: 4 });
      }
    }
    if (item.tips) {
      drawLines(`Tips: ${item.tips}`, { size: 10, color: GRAY, gap: 4 });
    }
    if (item.notes) {
      drawLines(`AI notes: ${item.notes}`, { size: 10, color: DARK, gap: 6 });
    }

    // Photo
    if (item.photo) {
      try {
        const img = await doc.embedJpg(item.photo);
        const maxImgW = CONTENT_W;
        const maxImgH = 320;
        const scale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        ensureSpace(h + 10);
        page.drawImage(img, { x: MARGIN, y: y - h, width: w, height: h });
        y -= h + 14;
      } catch {
        drawLines("(photo could not be embedded)", { size: 10, color: RED, gap: 6 });
      }
    } else {
      drawLines("(no photo provided)", { size: 10, color: GRAY, gap: 6 });
    }

      // spacing between items
      y -= 6;
    }

    // spacing between areas
    y -= 8;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
