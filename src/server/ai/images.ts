// src/server/ai/images.ts
// Sharp-based image pre-processing: auto-rotate, strip EXIF/GPS, JPEG, long edge ≤ 1568 px.
// Also provides downloadPhoto() for Supabase storage downloads.

import sharp from "sharp";
import type { Part } from "./client";

const MAX_LONG_EDGE = 1568;

export async function prepareImage(input: Buffer): Promise<string> {
  const img = sharp(input).rotate(); // auto-rotate from EXIF
  const meta = await img.metadata();

  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const longEdge = Math.max(w, h);

  const resized =
    longEdge > MAX_LONG_EDGE
      ? img.resize(
          w >= h ? MAX_LONG_EDGE : undefined,
          h > w ? MAX_LONG_EDGE : undefined,
          { withoutEnlargement: true },
        )
      : img;

  const jpeg = await resized
    .jpeg({ quality: 85 })
    .withMetadata({ exif: {} }) // strips all EXIF/GPS
    .toBuffer();

  return jpeg.toString("base64");
}

export function imageToInlineData(base64: string): Part {
  return { inlineData: { mimeType: "image/jpeg", data: base64 } };
}

export async function downloadPhoto(path: string): Promise<Buffer> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data, error } = await supabase.storage
    .from(process.env.SUPABASE_BUCKET ?? "stitchsafe-photos")
    .download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
