// src/server/ai/schemas.ts
// Zod 4 output schemas for every AI call.
// HARD RULE: NO money fields (amountCents, price, totalCents, cost, etc.) in any schema here.
// AI never sets prices; amounts come from tailor input and src/domain/pricing.ts only.

import { z } from "zod";

// ── Checklist ────────────────────────────────────────────────────────────────

export const ChecklistItemSchema = z.object({
  id: z.string(),
  label_en: z.string(),
  label_local: z.string(),
  local_lang: z.enum(["ta", "hi", "en"]),
  source_quote: z.string(),
  checkMethod: z.enum(["photo", "fit"]),
});

export const ChecklistSchema = z.object({
  items: z.array(ChecklistItemSchema),
  priceLineSuggestions: z.array(
    z.object({
      lineType: z.enum(["BASE", "RUSH", "SHIPPING", "CUSTOMS"]),
      label: z.string(),
      reason: z.string(),
    }),
  ),
  deadlineText: z.string(),
  // Normalised integer: "3 weeks" → 21, "2 vaaram" → 14, "15 din" → 15, null if not parseable
  deadlineDays: z.number().int().nullable(),
  ambiguities: z.array(z.string()),
});

export type ChecklistOutput = z.infer<typeof ChecklistSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;

// ── Change ───────────────────────────────────────────────────────────────────

const ChangedItemSchema = z.object({
  id: z.string(),
  label_en: z.string(),
  reason: z.string(),
});

export const ChangeSchema = z.object({
  added: z.array(ChangedItemSchema),
  modified: z.array(ChangedItemSchema),
  removed: z.array(ChangedItemSchema),
  summary_en: z.string(),
  summary_local: z.string(),
});

export type ChangeOutput = z.infer<typeof ChangeSchema>;

// ── Verify ───────────────────────────────────────────────────────────────────

export const PhotoAssessmentSchema = z.object({
  imageRef: z.string(),
  unrelated: z.boolean(),
  unrelatedReason: z.string(),
});

export const VerifySchema = z.object({
  photoAssessments: z.array(PhotoAssessmentSchema),
  verdicts: z.array(
    z.object({
      itemId: z.string(),
      verdict: z.enum(["MET", "PARTLY_MET", "NOT_MET"]),
      evidence: z.string(),
      imageRefs: z.array(z.string()),
      feedbackForTailor: z.string(),
    }),
  ),
  notes: z.string(),
});

export type VerifyOutput = z.infer<typeof VerifySchema>;
export type PhotoAssessment = z.infer<typeof PhotoAssessmentSchema>;

// ── Receipt ──────────────────────────────────────────────────────────────────

export const ReceiptSchema = z.object({
  text_en: z.string(),
  text_local: z.string(),
});

export type ReceiptOutput = z.infer<typeof ReceiptSchema>;
