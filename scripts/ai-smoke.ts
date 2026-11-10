// scripts/ai-smoke.ts
// Live smoke test for the AI layer. Requires GEMINI_API_KEY in .env.
// Usage: npm run ai:smoke
// Skips verify step if tests/ai/samples/photos/ has no .jpg files.

import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { buildChecklist } from "../src/server/ai/checklist";
import { writeChange } from "../src/server/ai/change";
import { writeReceipt } from "../src/server/ai/receipt";
import { verifyPhotos } from "../src/server/ai/verify";
import type { ChecklistItem } from "../src/server/ai/schemas";

const SAMPLES_DIR = join(__dirname, "../tests/ai/samples");
const PHOTOS_DIR = join(SAMPLES_DIR, "photos");

function printResult(result: unknown) {
  if (result && typeof result === "object" && "status" in result) {
    const r = result as { status: string; reason?: string; reasons?: string[] };
    if (r.status === "PHOTOS_REJECTED_UNRELATED") {
      console.log(`  ✗ PHOTOS_REJECTED_UNRELATED: ${(r.reasons ?? []).join("; ")}`);
    } else {
      console.log(`  ⚠ NEEDS_MANUAL_REVIEW: ${r.reason}`);
    }
  } else {
    console.log("  ✓", JSON.stringify(result, null, 2).split("\n").slice(0, 20).join("\n  "));
  }
}

async function smokeChecklist(name: string, chatFile: string) {
  console.log(`
${"─".repeat(60)}`);
  console.log(`Checklist: ${name}`);
  const chat = readFileSync(join(SAMPLES_DIR, chatFile), "utf8");
  const result = await buildChecklist(chat);
  if ("status" in result) {
    console.log(`  ⚠ NEEDS_MANUAL_REVIEW: ${result.reason}`);
    return null;
  }
  console.log(`  ✓ ${result.items.length} items — deadline: ${result.deadlineText} (${result.deadlineDays ?? "?"} days)`);
  for (const item of result.items) {
    console.log(`    [${item.id}] ${item.label_en} (${item.checkMethod})`);
  }
  if (result.ambiguities.length > 0) console.log(`  Ambiguities: ${result.ambiguities.join("; ")}`);
  return result;
}

async function smokeChange(name: string, checklistItems: ChecklistItem[], addOnChat: string) {
  console.log(`
${"─".repeat(60)}`);
  console.log(`Change (${name}):`);
  const result = await writeChange(checklistItems, addOnChat);
  printResult(result);
}

async function smokeReceipt(name: string, items: ChecklistItem[], currency: "USD") {
  console.log(`
${"─".repeat(60)}`);
  console.log(`Receipt RELEASED (${name}):`);
  const result = await writeReceipt("RELEASED", { items, currency });
  printResult(result);

  console.log(`
Receipt VOIDED (${name}):`);
  const result2 = await writeReceipt("VOIDED", { items, currency });
  printResult(result2);
}

async function smokeVerifySingle(name: string, photoFile: string, checklistItems: ChecklistItem[]) {
  console.log(`
${"─".repeat(60)}`);
  console.log(`Verify: ${name} (${photoFile})`);
  const photoItems = checklistItems.filter((i) => i.checkMethod === "photo");
  console.log(`  Photo-verifiable items: ${photoItems.length} (of ${checklistItems.length} total)`);
  const photo = readFileSync(join(PHOTOS_DIR, photoFile));
  const result = await verifyPhotos(checklistItems, [photo]);
  if ("status" in result) {
    if (result.status === "PHOTOS_REJECTED_UNRELATED") {
      console.log(`  ✗ PHOTOS_REJECTED_UNRELATED: ${(result as { reasons: string[] }).reasons.join("; ")}`);
    } else {
      console.log(`  ⚠ NEEDS_MANUAL_REVIEW: ${(result as { reason: string }).reason}`);
    }
  } else {
    if (result.photoAssessments) {
      for (const pa of result.photoAssessments) {
        console.log(`  [${pa.imageRef}] unrelated=${pa.unrelated}${pa.unrelatedReason ? " — " + pa.unrelatedReason : ""}`);
      }
    }
    for (const v of result.verdicts) {
      console.log(`  [${v.itemId}] ${v.verdict} — ${v.evidence}`);
      if (v.feedbackForTailor) console.log(`    → ${v.feedbackForTailor}`);
    }
    if (result.notes) console.log(`  Notes: ${result.notes}`);
  }
}

async function main() {
  console.log("StitchSafe AI smoke test\n");

  const englishChecklist = await smokeChecklist("English", "chat_english.txt");
  const tamilChecklist = await smokeChecklist("Tamil", "chat_tamil.txt");
  await smokeChecklist("Hindi-English", "chat_hindi_english.txt");

  // English change
  if (englishChecklist && !("status" in englishChecklist)) {
    await smokeChange("English add-on", englishChecklist.items, `Customer: Actually I'd also like gold embroidery along the collar edge.
Tailor: We can add that. It will take 2 extra days.
Customer: And can we change the button colour from white to black?
Tailor: Yes, black pearl buttons instead of white.`);
  }

  // Tamil change (tests summary_local in Tamil)
  if (tamilChecklist && !("status" in tamilChecklist)) {
    await smokeChange("Tamil add-on", tamilChecklist.items, `Customer: காலர் edge-ல embroidery வேணும்.
Tailor: சரி, silver embroidery போடறோம்.
Customer: Pocket-ல zip வேணும்.
Tailor: சரி, zip pocket.`);
  }

  // English receipt
  const enItems: ChecklistItem[] = [
    { id: "fabric_color", label_en: "White cotton fabric", label_local: "White cotton fabric", local_lang: "en", source_quote: "white cotton", checkMethod: "photo" },
    { id: "collar_type", label_en: "Mandarin collar", label_local: "Mandarin collar", local_lang: "en", source_quote: "mandarin collar", checkMethod: "photo" },
    { id: "button_count", label_en: "7 pearl buttons on front", label_local: "7 pearl buttons on front", local_lang: "en", source_quote: "7 buttons", checkMethod: "photo" },
  ];
  await smokeReceipt("English", enItems, "USD");

  // Tamil receipt (tests text_local in Tamil)
  const taItems: ChecklistItem[] = [
    { id: "fabric_color", label_en: "Blue cotton fabric", label_local: "நீல நிற பருத்தி துணி", local_lang: "ta", source_quote: "நீல நிற பருத்தி", checkMethod: "photo" },
    { id: "collar_type", label_en: "Chinese collar", label_local: "Chinese காலர்", local_lang: "ta", source_quote: "Chinese காலர்", checkMethod: "photo" },
    { id: "pocket", label_en: "One bottom pocket", label_local: "ஒரு கீழ் pocket", local_lang: "ta", source_quote: "கீழே ஒரு pocket", checkMethod: "photo" },
  ];
  await smokeReceipt("Tamil", taItems, "USD");

  // Verify: run separately for each photo
  if (existsSync(PHOTOS_DIR)) {
    const jpgs = readdirSync(PHOTOS_DIR).filter((f) => f.endsWith(".jpg"));
    const items: ChecklistItem[] = englishChecklist && !("status" in englishChecklist)
      ? englishChecklist.items
      : [
          { id: "fabric_color", label_en: "Correct fabric color", label_local: "Correct fabric color", local_lang: "en" as const, source_quote: "matching color", checkMethod: "photo" as const },
          { id: "collar_type", label_en: "Correct collar type", label_local: "Correct collar type", local_lang: "en" as const, source_quote: "collar shape", checkMethod: "photo" as const },
        ];
    for (const jpg of jpgs) {
      await smokeVerifySingle(jpg, jpg, items);
    }
    if (jpgs.length === 0) {
      console.log("\n" + "─".repeat(60));
      console.log("Verify: ⚠ Skipped: no .jpg files in tests/ai/samples/photos/");
    }
  } else {
    console.log("\n" + "─".repeat(60));
    console.log("Verify: ⚠ Skipped: tests/ai/samples/photos/ not found");
    console.log("  Provide matching.jpg and non_matching.jpg to enable this step.");
  }

  console.log(`
${"─".repeat(60)}`);
  console.log("Smoke test complete.");
}

main().catch((err) => {
  console.error("Smoke test failed:", err);
  process.exit(1);
});
