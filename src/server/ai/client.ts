// src/server/ai/client.ts
// The ONLY file that imports @google/genai.
// Every AI call goes through generateJson(); it handles retry + NEEDS_MANUAL_REVIEW.
//
// Retry policy:
//   - SAFETY / MAX_TOKENS / blocked / parse / Zod failure → retry once (same model).
//   - HTTP 429 / 503 on GEMINI_MODEL_VISION → retry once with GEMINI_MODEL_VISION_FALLBACK.
//   - Second failure of any kind → { status: "NEEDS_MANUAL_REVIEW", reason }.
//   AI failures never capture, void, or change a total.

import { GoogleGenAI, ApiError } from "@google/genai";
import type { Part } from "@google/genai";
import { z } from "zod";

export type { Part };

export type NeedsReview = { status: "NEEDS_MANUAL_REVIEW"; reason: string };

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const VISION_MODEL = () => process.env.GEMINI_MODEL_VISION ?? "gemini-2.0-flash";
const VISION_FALLBACK = () =>
  process.env.GEMINI_MODEL_VISION_FALLBACK ?? "gemini-1.5-flash";
const FAST_MODEL = () => process.env.GEMINI_MODEL_FAST ?? "gemini-2.0-flash-lite";

export { VISION_MODEL, VISION_FALLBACK, FAST_MODEL };

function isRetryableStatus(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 429 || err.status === 503);
}

function isVisionModel(model: string): boolean {
  return model === VISION_MODEL();
}

async function callOnce<T>(
  model: string,
  parts: Part[],
  schema: z.ZodType<T>,
  system: string | undefined,
): Promise<T> {
  const response = await ai.models.generateContent({
    model,
    contents: [{ parts }],
    config: {
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseJsonSchema: (z as any).toJSONSchema(schema) as Record<string, unknown>,
      temperature: 0.1,
      ...(system ? { systemInstruction: system } : {}),
    },
  });

  const candidate = response.candidates?.[0];
  const finishReason = candidate?.finishReason;

  if (
    finishReason === "SAFETY" ||
    finishReason === "MAX_TOKENS" ||
    finishReason === "BLOCKLIST" ||
    finishReason === "PROHIBITED_CONTENT" ||
    !candidate
  ) {
    throw new Error(`finishReason=${finishReason ?? "no_candidate"}`);
  }

  const text = response.text;
  if (!text) throw new Error("empty response text");

  const parsed = JSON.parse(text) as unknown;
  return schema.parse(parsed);
}

export async function generateJson<T>(opts: {
  model: string;
  parts: Part[];
  schema: z.ZodType<T>;
  system?: string;
}): Promise<T | NeedsReview> {
  const { model, parts, schema, system } = opts;

  let firstError: string;

  // Attempt 1
  try {
    return await callOnce(model, parts, schema, system);
  } catch (err) {
    firstError = err instanceof Error ? err.message : String(err);

    // 429/503 on vision model → switch to fallback for attempt 2
    if (isRetryableStatus(err) && isVisionModel(model)) {
      try {
        return await callOnce(VISION_FALLBACK(), parts, schema, system);
      } catch (err2) {
        return {
          status: "NEEDS_MANUAL_REVIEW",
          reason: `vision fallback failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
        };
      }
    }
  }

  // Attempt 2 — same model (parse/Zod/finish-reason failures)
  try {
    return await callOnce(model, parts, schema, system);
  } catch (err2) {
    return {
      status: "NEEDS_MANUAL_REVIEW",
      reason: `attempt 1: ${firstError}; attempt 2: ${err2 instanceof Error ? err2.message : String(err2)}`,
    };
  }
}
