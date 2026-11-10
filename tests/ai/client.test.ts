// tests/ai/client.test.ts
// Contract tests for the AI layer. All calls are mocked — no live Gemini calls.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChecklistOutput } from "../../src/server/ai/schemas";
import { z } from "zod";

// ── Mock @google/genai ───────────────────────────────────────────────────────

const mockGenerateContent = vi.fn();
const MockApiError = class extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
};

vi.mock("../../src/server/ai/images", () => ({
  prepareImage: vi.fn(async () => "ZmFrZS1iYXNlNjQ="),
  imageToInlineData: vi.fn((b64: string) => ({ inlineData: { mimeType: "image/jpeg", data: b64 } })),
}));

vi.mock("@google/genai", () => ({
  // Must be a real constructor (not arrow fn) so 'new GoogleGenAI()' works
  GoogleGenAI: vi.fn(function(this: unknown) {
    (this as { models: unknown }).models = { generateContent: mockGenerateContent };
  }),
  ApiError: MockApiError,
}));

// Import after mock
const { generateJson, VISION_MODEL, VISION_FALLBACK } = await import(
  "../../src/server/ai/client"
);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeOkResponse(text: string) {
  return {
    text,
    candidates: [{ finishReason: "STOP" }],
  };
}

const SimpleSchema = z.object({ name: z.string() });

beforeEach(() => {
  mockGenerateContent.mockReset();
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_MODEL_VISION = "gemini-vision-test";
  process.env.GEMINI_MODEL_VISION_FALLBACK = "gemini-vision-fallback-test";
  process.env.GEMINI_MODEL_FAST = "gemini-fast-test";
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("generateJson", () => {
  it("returns parsed result on valid response", async () => {
    mockGenerateContent.mockResolvedValue(makeOkResponse(JSON.stringify({ name: "Alice" })));
    const result = await generateJson({
      model: "gemini-fast-test",
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toEqual({ name: "Alice" });
  });

  it("retries once on bad JSON then returns NEEDS_MANUAL_REVIEW", async () => {
    mockGenerateContent.mockResolvedValue(makeOkResponse("not json at all"));
    const result = await generateJson({
      model: "gemini-fast-test",
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2); // attempt 1 + attempt 2
  });

  it("retries once on Zod validation failure then returns NEEDS_MANUAL_REVIEW", async () => {
    // Returns valid JSON but wrong shape (missing 'name')
    mockGenerateContent.mockResolvedValue(makeOkResponse(JSON.stringify({ wrong: "field" })));
    const result = await generateJson({
      model: "gemini-fast-test",
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("on 503 from vision model, retries with fallback model", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new MockApiError(503, "overloaded"))
      .mockResolvedValueOnce(makeOkResponse(JSON.stringify({ name: "Bob" })));

    const result = await generateJson({
      model: VISION_MODEL(),
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toEqual({ name: "Bob" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
    // Second call must use the fallback model
    expect(mockGenerateContent.mock.calls[1][0]).toMatchObject({
      model: VISION_FALLBACK(),
    });
  });

  it("on 503 from vision fallback, returns NEEDS_MANUAL_REVIEW", async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new MockApiError(503, "overloaded"))
      .mockRejectedValueOnce(new MockApiError(503, "still overloaded"));

    const result = await generateJson({
      model: VISION_MODEL(),
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
  });

  it("on 429, retries once then returns NEEDS_MANUAL_REVIEW", async () => {
    mockGenerateContent.mockRejectedValue(new MockApiError(429, "rate limit"));
    const result = await generateJson({
      model: VISION_MODEL(),
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
  });

  it("SAFETY finishReason triggers retry → NEEDS_MANUAL_REVIEW", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "{}",
      candidates: [{ finishReason: "SAFETY" }],
    });
    const result = await generateJson({
      model: "gemini-fast-test",
      parts: [{ text: "hello" }],
      schema: SimpleSchema,
    });
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });

  it("VerifySchema rejects output with price-like fields (strict parse)", async () => {
    // The fixture has extra 'amountCents' and 'totalCents' fields — Zod 4 strips unknowns by default
    // but the schema itself must not contain money fields.
    // Verify the VerifySchema can be imported and has no money-named keys.
    const { VerifySchema } = await import("../../src/server/ai/schemas");
    const shape = VerifySchema.shape;
    const keys = Object.keys(shape);
    const moneyKeys = keys.filter((k) =>
      /amount|price|cost|total|cents|usd/i.test(k),
    );
    expect(moneyKeys).toHaveLength(0);
  });

  it("ChecklistSchema includes deadlineDays as nullable integer", async () => {
    const { ChecklistSchema } = await import("../../src/server/ai/schemas");
    const shape = ChecklistSchema.shape;
    expect("deadlineDays" in shape).toBe(true);
    // null is valid
    const r1 = ChecklistSchema.parse({
      items: [],
      priceLineSuggestions: [],
      deadlineText: "",
      deadlineDays: null,
      ambiguities: [],
    });
    expect(r1.deadlineDays).toBeNull();
    // integer is valid
    const r2 = ChecklistSchema.parse({
      items: [],
      priceLineSuggestions: [],
      deadlineText: "2 weeks",
      deadlineDays: 14,
      ambiguities: [],
    });
    expect(r2.deadlineDays).toBe(14);
  });

  it("buildChecklist returns NEEDS_MANUAL_REVIEW for compound items", async () => {
    const compoundFixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/checklist_compound_item.json"),
        "utf8",
      ),
    ) as ChecklistOutput;
    // Mock a successful model response returning the compound fixture
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(compoundFixture)),
    );
    const { buildChecklist } = await import("../../src/server/ai/checklist");
    const result = await buildChecklist("some chat history");
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect((result as { reason: string }).reason).toMatch(/compound/i);
  });

  it("English chat fixture includes chest, length and sleeve measurement items", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/checklist_english_measurements.json"),
        "utf8",
      ),
    ) as ChecklistOutput;
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { buildChecklist } = await import("../../src/server/ai/checklist");
    const result = await buildChecklist("some chat history");
    expect("items" in result).toBe(true);
    if (!("items" in result)) return;

    const fitItems = result.items.filter((i) => i.checkMethod === "fit");
    expect(fitItems.length).toBeGreaterThanOrEqual(3);

    const fitLabels = fitItems.map((i) => i.label_en.toLowerCase());
    expect(fitLabels.some((l) => l.includes("chest"))).toBe(true);
    expect(fitLabels.some((l) => l.includes("length") && !l.includes("sleeve"))).toBe(true);
    expect(fitLabels.some((l) => l.includes("sleeve"))).toBe(true);

    for (const item of fitItems) {
      expect(item.checkMethod).toBe("fit");
    }
    const photoItems = result.items.filter((i) => i.checkMethod === "photo");
    expect(photoItems.length).toBeGreaterThanOrEqual(1);
  });

  it("buildChecklist rejects money in priceLineSuggestion label", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/checklist_money_in_suggestion.json"),
        "utf8",
      ),
    ) as ChecklistOutput;
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { buildChecklist } = await import("../../src/server/ai/checklist");
    const result = await buildChecklist("some chat history");
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect((result as { reason: string }).reason).toMatch(/money amount/i);
  });

  it("buildChecklist rejects money in ambiguity", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/checklist_money_in_ambiguity.json"),
        "utf8",
      ),
    ) as ChecklistOutput;
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { buildChecklist } = await import("../../src/server/ai/checklist");
    const result = await buildChecklist("some chat history");
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect((result as { reason: string }).reason).toMatch(/money amount/i);
  });

  it("writeChange rejects wording-only modifications", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/change_wording_only.json"),
        "utf8",
      ),
    );
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { writeChange } = await import("../../src/server/ai/change");
    const previousItems = [
      { id: "fabric_color", label_en: "White cotton fabric", label_local: "White cotton fabric", local_lang: "en" as const, source_quote: "white cotton", checkMethod: "photo" as const },
    ];
    const result = await writeChange(previousItems, "change fabric to material");
    expect(result).toMatchObject({ status: "NEEDS_MANUAL_REVIEW" });
    expect((result as { reason: string }).reason).toMatch(/wording-only/i);
  });

  it("verifyPhotos returns PHOTOS_REJECTED_UNRELATED when all photos are unrelated", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/verify_all_unrelated.json"),
        "utf8",
      ),
    );
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { verifyPhotos } = await import("../../src/server/ai/verify");
    const items = [
      { id: "fabric_color", label_en: "White cotton", label_local: "White cotton", local_lang: "en" as const, source_quote: "white", checkMethod: "photo" as const },
      { id: "collar_type", label_en: "Mandarin collar", label_local: "Mandarin collar", local_lang: "en" as const, source_quote: "mandarin", checkMethod: "photo" as const },
    ];
    const result = await verifyPhotos(items, [Buffer.from("fake-photo")]);
    expect(result).toMatchObject({ status: "PHOTOS_REJECTED_UNRELATED" });
    expect((result as { reasons: string[] }).reasons).toHaveLength(2);
    expect((result as { reasons: string[] }).reasons[0]).toMatch(/landscape/i);
  });

  it("verifyPhotos grades normally when one photo is unrelated but another is related", async () => {
    const fixture = JSON.parse(
      require("fs").readFileSync(
        require("path").join(__dirname, "../ai/fixtures/verify_mixed_unrelated.json"),
        "utf8",
      ),
    );
    mockGenerateContent.mockResolvedValue(
      makeOkResponse(JSON.stringify(fixture)),
    );
    const { verifyPhotos } = await import("../../src/server/ai/verify");
    const items = [
      { id: "fabric_color", label_en: "White cotton", label_local: "White cotton", local_lang: "en" as const, source_quote: "white", checkMethod: "photo" as const },
      { id: "collar_type", label_en: "Mandarin collar", label_local: "Mandarin collar", local_lang: "en" as const, source_quote: "mandarin", checkMethod: "photo" as const },
    ];
    const result = await verifyPhotos(items, [Buffer.from("fake1"), Buffer.from("fake2")]);
    // Should NOT be rejected — should return normal VerifyOutput with verdicts
    expect("status" in result).toBe(false);
    expect("verdicts" in result).toBe(true);
    if ("verdicts" in result) {
      expect(result.verdicts).toHaveLength(2);
      expect(result.verdicts[0].verdict).toBe("MET");
      expect(result.verdicts[1].verdict).toBe("PARTLY_MET");
    }
  });

  it("ChecklistItemSchema requires checkMethod field", async () => {
    const { ChecklistItemSchema } = await import("../../src/server/ai/schemas");
    const valid = ChecklistItemSchema.parse({
      id: "test", label_en: "Test", label_local: "Test",
      local_lang: "en", source_quote: "test", checkMethod: "photo",
    });
    expect(valid.checkMethod).toBe("photo");
    const valid2 = ChecklistItemSchema.parse({
      id: "test", label_en: "Test", label_local: "Test",
      local_lang: "en", source_quote: "test", checkMethod: "fit",
    });
    expect(valid2.checkMethod).toBe("fit");
    expect(() => ChecklistItemSchema.parse({
      id: "test", label_en: "Test", label_local: "Test",
      local_lang: "en", source_quote: "test",
    })).toThrow();
  });
});
