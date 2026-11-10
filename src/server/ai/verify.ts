// src/server/ai/verify.ts
import { readFileSync } from "fs";
import { join } from "path";
import { generateJson, VISION_MODEL } from "./client";
import { prepareImage, imageToInlineData } from "./images";
import type { NeedsReview } from "./client";
import { VerifySchema } from "./schemas";
import type { VerifyOutput, ChecklistItem } from "./schemas";

const PROMPT = readFileSync(join(__dirname, "prompts/verify.txt"), "utf8");

export async function verifyPhotos(
  checklistItems: ChecklistItem[],
  photos: Buffer[],
): Promise<VerifyOutput | NeedsReview> {
  // Only grade photo-verifiable items; "fit" items are confirmed at the fit step
  const photoItems = checklistItems.filter((i) => i.checkMethod === "photo");

  if (photoItems.length === 0) {
    return { photoAssessments: [], verdicts: [], notes: "All items are fit-check only; no photo verification needed." };
  }

  const max = Math.min(photos.length, 4);
  const imageParts = await Promise.all(
    photos.slice(0, max).map(async (buf, i) => {
      const b64 = await prepareImage(buf);
      return [{ text: `Image ${i + 1}:` }, imageToInlineData(b64)];
    }),
  );

  const checklistText = `Checklist items:\n${JSON.stringify(photoItems, null, 2)}`;
  const parts = [{ text: checklistText }, ...imageParts.flat()];

  const result = await generateJson({
    model: VISION_MODEL(),
    parts,
    schema: VerifySchema,
    system: PROMPT,
  });

  if ("status" in result) return result;

  // Business check: reject uploads where all photos are unrelated
  const allUnrelated = result.photoAssessments.length > 0 &&
    result.photoAssessments.every((pa) => pa.unrelated);
  if (allUnrelated) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: "all uploaded photos are unrelated to the ordered garment",
    };
  }

  // Business checks — against photoItems only
  const knownIds = new Set(photoItems.map((i) => i.id));
  const returnedIds = result.verdicts.map((v) => v.itemId);

  const unknownIds = returnedIds.filter((id) => !knownIds.has(id));
  if (unknownIds.length > 0) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: `verify returned unknown itemIds: ${unknownIds.join(", ")}`,
    };
  }

  const seenIds = new Set<string>();
  for (const v of result.verdicts) {
    if (seenIds.has(v.itemId)) {
      return {
        status: "NEEDS_MANUAL_REVIEW",
        reason: `verify returned duplicate itemId: ${v.itemId}`,
      };
    }
    seenIds.add(v.itemId);
  }

  const missingIds = [...knownIds].filter((id) => !seenIds.has(id));
  if (missingIds.length > 0) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: `verify missing verdicts for itemIds: ${missingIds.join(", ")}`,
    };
  }

  // Normalise verdict enum to uppercase (defensive)
  for (const v of result.verdicts) {
    v.verdict = v.verdict.toUpperCase() as "MET" | "PARTLY_MET" | "NOT_MET";
  }

  return result;
}
