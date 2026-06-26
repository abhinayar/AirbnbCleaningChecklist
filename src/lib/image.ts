export type NormalizedImage = {
  buffer: Buffer;
  width: number;
  height: number;
};

function isJpeg(b: Buffer): boolean {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/**
 * Re-encode an uploaded photo into a reasonably sized JPEG via sharp (auto-rotate
 * from EXIF, downscale). If sharp is unavailable or can't decode the input, fall
 * back to passing an already-JPEG buffer through unchanged (the client converts
 * camera photos to JPEG before upload, so this keeps uploads working regardless).
 */
export async function normalizePhoto(input: Buffer): Promise<NormalizedImage> {
  try {
    const sharp = (await import("sharp")).default;
    const buffer = await sharp(input, { failOn: "none" })
      .rotate() // apply EXIF orientation
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    const meta = await sharp(buffer).metadata();
    return { buffer, width: meta.width ?? 0, height: meta.height ?? 0 };
  } catch (err) {
    if (isJpeg(input)) {
      // sharp couldn't process it but the client already sent a JPEG — use as-is.
      return { buffer: input, width: 0, height: 0 };
    }
    console.error("normalizePhoto failed and input is not JPEG:", err);
    throw err;
  }
}
