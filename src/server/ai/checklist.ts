// src/server/ai/checklist.ts
import { readFileSync } from "fs";
import { join } from "path";
import { generateJson, FAST_MODEL } from "./client";
import type { NeedsReview } from "./client";
import { ChecklistSchema } from "./schemas";
import type { ChecklistOutput } from "./schemas";

const PROMPT = readFileSync(join(__dirname, "prompts/checklist.txt"), "utf8");

// Matches digits adjacent to currency words/symbols
const MONEY_RE = /\d[\d,.]*\s*(?:[\$\u20B9]|USD|INR|Rs\.?|rupees?|dollars?)|(?:[\$\u20B9]|USD|INR|Rs\.?|rupees?|dollars?)\s*\d/i;

export async function buildChecklist(
  chatHistory: string,
): Promise<ChecklistOutput | NeedsReview> {
  const result = await generateJson({
    model: FAST_MODEL(),
    parts: [{ text: `Chat history:
${chatHistory}` }],
    schema: ChecklistSchema,
    system: PROMPT,
  });

  if ("status" in result) return result;

  // Business check: must have at least one item
  if (result.items.length === 0) {
    return { status: "NEEDS_MANUAL_REVIEW", reason: "checklist returned 0 items" };
  }

  // Business check: each item must be atomic (one attribute).
  const compound = result.items.filter((item) => {
    const parts = item.label_en.split(/\s+and\s+/i);
    return parts.length > 1 && parts.every((p) => p.trim().split(/\s+/).length >= 2);
  });
  if (compound.length > 0) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: "compound items (split required): " + compound.map((i) => '"' + i.label_en + '"').join(", "),
    };
  }

  // Business check: priceLineSuggestions must not contain money amounts
  for (const pls of result.priceLineSuggestions) {
    if (MONEY_RE.test(pls.label) || MONEY_RE.test(pls.reason)) {
      return {
        status: "NEEDS_MANUAL_REVIEW",
        reason: "priceLineSuggestion contains a money amount: " + JSON.stringify(pls),
      };
    }
  }

  // Business check: ambiguities must not contain money amounts
  for (const amb of result.ambiguities) {
    if (MONEY_RE.test(amb)) {
      return {
        status: "NEEDS_MANUAL_REVIEW",
        reason: "ambiguity contains a money amount: " + JSON.stringify(amb),
      };
    }
  }

  return result;
}
