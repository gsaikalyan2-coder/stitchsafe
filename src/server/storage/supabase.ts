// src/server/storage/supabase.ts
// Upload / download helpers for the private bucket stitchsafe-photos.

import { createClient } from "@supabase/supabase-js";

const BUCKET = process.env.SUPABASE_BUCKET ?? "stitchsafe-photos";

function getClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function uploadPhoto(path: string, data: Buffer): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, data, { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.warn(`[Storage] Upload warning for ${path}: ${error.message}`);
    // Don't crash entire order flow if storage bucket is missing in demo/dev
  }
}

export async function downloadPhoto(path: string): Promise<Buffer> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}
