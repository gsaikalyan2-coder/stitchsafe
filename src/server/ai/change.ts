// src/server/ai/change.ts
import { readFileSync } from "fs";
import { join } from "path";
import { generateJson, FAST_MODEL } from "./client";
import type { NeedsReview } from "./client";
import { ChangeSchema } from "./schemas";
import type { ChangeOutput, ChecklistItem } from "./schemas";

const PROMPT = readFileSync(join(__dirname, "prompts/change.txt"), "utf8");

export async function writeChange(
  previousItems: ChecklistItem[],
  chatHistory: string,
): Promise<ChangeOutput | NeedsReview> {
  const contextText = [
    `Current checklist:\n${JSON.stringify(previousItems, null, 2)}`,
    `New conversation:\n${chatHistory}`,
  ].join("\n\n");

  const result = await generateJson({
    model: FAST_MODEL(),
    parts: [{ text: contextText }],
    schema: ChangeSchema,
    system: PROMPT,
  });

  if ("status" in result) return result;

  // Business check: modified/removed ids must exist in the previous checklist
  const knownIds = new Set(previousItems.map((i) => i.id));
  const badIds = [...result.modified, ...result.removed]
    .map((i) => i.id)
    .filter((id) => !knownIds.has(id));

  if (badIds.length > 0) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: `change writer referenced unknown item ids: ${badIds.join(", ")}`,
    };
  }

  // Business check: reject "modified" items that are wording-only (reason says reword/rephrase/rename)
  const wordingOnly = result.modified.filter((m) =>
    /(reword|rephrase|rename|rewording|rephrasing|spelling|typo|wording)/i.test(m.reason),
  );
  if (wordingOnly.length > 0) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: "wording-only modifications (no semantic change): " + wordingOnly.map((i) => '"' + i.id + '"').join(", "),
    };
  }

  return result;
}
