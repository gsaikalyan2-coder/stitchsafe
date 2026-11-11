// src/server/ai/receipt.ts
// Writes a human-readable receipt for a completed/voided order.
// receipt.ts receives a server-decided outcome; it never decides anything.
import { readFileSync } from "fs";
import { join } from "path";
import { generateJson, FAST_MODEL } from "./client";
import type { NeedsReview } from "./client";
import { ReceiptSchema } from "./schemas";
import type { ReceiptOutput, ChecklistItem } from "./schemas";

const PROMPT = readFileSync(join(process.cwd(), "src/server/ai/prompts/receipt.txt"), "utf8");

export async function writeReceipt(
  outcome: "RELEASED" | "VOIDED" | "CANCELLED",
  summaryData: { items: ChecklistItem[]; currency: "USD" },
): Promise<ReceiptOutput | NeedsReview> {
  const contextText = [
    `Outcome: ${outcome}`,
    `Items: ${JSON.stringify(summaryData.items, null, 2)}`,
    `Currency: ${summaryData.currency}`,
  ].join("\n");

  const result = await generateJson({
    model: FAST_MODEL(),
    parts: [{ text: contextText }],
    schema: ReceiptSchema,
    system: PROMPT,
  });

  if ("status" in result) return result;

  // Business check: text_en ≤ 120 words
  const wordCount = result.text_en.trim().split(/\s+/).length;
  if (wordCount > 120) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: `receipt text_en too long: ${wordCount} words (max 120)`,
    };
  }

  return result;
}
