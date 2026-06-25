export type NormalizedImage = {
  buffer: Buffer;
  width: number;
  height: number;
};

/**
 * Re-encode any uploaded photo (HEIC from iPhones, PNG, oversized JPEG, etc.)
 * into a reasonably sized JPEG. Smaller = cheaper for Claude and lighter PDFs.
 * Auto-rotates based on EXIF so portrait phone shots aren't sideways.
 */
export async function normalizePhoto(input: Buffer): Promise<NormalizedImage> {
  // Imported dynamically so the native module loads at request time, not during
  // `next build` page-data collection.
  const sharp = (await import("sharp")).default;
  const img = sharp(input, { failOn: "none" }).rotate(); // rotate() applies EXIF orientation
  const resized = img.resize({
    width: 1600,
    height: 1600,
    fit: "inside",
    withoutEnlargement: true,
  });
  const buffer = await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}
