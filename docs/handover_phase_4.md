# StitchSafe — Handover after Phase 4 (AI)
Date: 2026-11-09 · Next phase: 5 (Full flow + UI)

## Part A — Project summary
- Goal: AI payment agent for tailors. Agree it, hold it, check it, release it (PayPal authorize → AI photo check → capture after fit confirmation).
- Deadline: Nov 12 2026. USD sandbox. Hosting: Render free. DB/storage: Supabase.
- Status: phases 0–4 done; local dev runs end-to-end for auth + PayPal hold/capture/void. AI layer is wired and tested; it is not yet connected to order routes (Phase 5).

## Part B — This session

### Done
- **Step 0 — Phase 3 review fixes:**
  - `orderService.ts` `reauthorizeDue()`: added `actorId: "SYSTEM"` to `PAYPAL_REAUTHORIZED` appendOrderEvent call (was missing, violating rule #5).
  - `orderService.ts` `reauthorizeDue()`: added re-read of payment inside `prisma.$transaction` with early-return guard `if (freshPayment.reauthorizedAt !== null) return` to prevent double-reauth race condition.
  - `package.json`: pinned `@google/genai` from `^1.0.0` to `1.52.0`.

- **Phase 4 — AI layer:**
  - `src/server/ai/schemas.ts` — Zod 4 schemas: ChecklistSchema, ChangeSchema, VerifySchema, ReceiptSchema. No money fields in any schema.
  - `src/server/ai/client.ts` — Only file importing `@google/genai`. `generateJson<T>()` with retry: 503/429 on vision model → fallback; SAFETY/MAX_TOKENS/parse/Zod failure → retry once; second failure → `{ status: "NEEDS_MANUAL_REVIEW" }`.
  - `src/server/ai/images.ts` — `prepareImage()` (sharp: auto-rotate, strip EXIF, JPEG, long edge ≤1568 px → base64), `imageToInlineData()`, `downloadPhoto()`.
  - `src/server/ai/checklist.ts` — `buildChecklist(chatHistory)` using GEMINI_MODEL_FAST.
  - `src/server/ai/change.ts` — `writeChange(previousItems, chatHistory)` using GEMINI_MODEL_FAST.
  - `src/server/ai/verify.ts` — `verifyPhotos(checklistItems, photos)` using GEMINI_MODEL_VISION; full business checks (every itemId exactly once, no unknowns, no duplicates).
  - `src/server/ai/receipt.ts` — `writeReceipt(outcome, summaryData)` using GEMINI_MODEL_FAST; never decides the outcome.
  - `src/server/ai/prompts/{checklist,change,verify,receipt}.txt` — system prompts.
  - `tests/ai/fixtures/` — 5 JSON fixtures for contract tests.
  - `tests/ai/samples/` — 3 sample chats (English, Tamil, Hindi-English).
  - `tests/ai/client.test.ts` — 15 contract tests; all mocked, no live calls (incl. checkMethod, measurements, compound-item, deadlineDays, money-in-suggestion, money-in-ambiguity, wording-only-change).
  - `scripts/ai-smoke.ts` — `npm run ai:smoke`; tests checklist (3 langs), change (English + Tamil), receipt (English + Tamil), verify per-photo with unrelated-photo detection (skips if no photos).

- **Round 2 hardening (pre-commit):**
  - `checklist.ts`: MONEY_RE business check rejects digits next to currency symbols/words in `priceLineSuggestions` label/reason and in `ambiguities`.
  - `checklist.txt` prompt: ambiguities must never include amounts/currencies.
  - `schemas.ts`: added `PhotoAssessmentSchema` (`imageRef`, `unrelated`, `unrelatedReason`) and `photoAssessments` array to `VerifySchema`.
  - `verify.ts`: added all-unrelated photo business check → NEEDS_MANUAL_REVIEW. Early-return for fit-only items includes `photoAssessments: []`.
  - `verify.txt` prompt: added per-photo unrelated assessment instructions.
  - `change.ts`: rejects wording-only modifications (regex on reason field).
  - `change.txt` prompt: do not emit modified items where only wording changed.
  - `ai-smoke.ts`: runs verify separately per photo; prints photo-item count and photoAssessments. Fixed string literal escaping issues.
  - Added 3 fixtures: `checklist_money_in_suggestion.json`, `checklist_money_in_ambiguity.json`, `change_wording_only.json`. Updated verify fixtures with `photoAssessments`.
  - Added 3 contract tests: money-in-suggestion, money-in-ambiguity, wording-only-change.
  - Fixed compound-item regex (backslashes lost in prior bash write: `s+ands+` → `\s+and\s+`).
  - Fixed wording-only regex (invisible backspace 0x08 chars from bash `\b` escape).

### Decisions made
- None new (all existing policy from decisions.md).

### Files created / modified
- `src/server/services/orderService.ts` — Step 0 bug fixes
- `src/server/ai/client.ts`, `schemas.ts`, `images.ts`, `checklist.ts`, `change.ts`, `verify.ts`, `receipt.ts`
- `src/server/ai/prompts/checklist.txt`, `change.txt`, `verify.txt`, `receipt.txt`
- `tests/ai/client.test.ts`
- `tests/ai/fixtures/checklist_good.json`, `checklist_bad_json.json`, `checklist_compound_item.json`, `checklist_english_measurements.json`, `checklist_money_in_suggestion.json`, `checklist_money_in_ambiguity.json`, `change_wording_only.json`, `verify_good.json`, `verify_unknown_id.json`, `verify_price_field.json`
- `tests/ai/samples/chat_english.txt`, `chat_tamil.txt`, `chat_hindi_english.txt`
- `tests/ai/samples/photos/` (directory; no photos yet — user must provide)
- `scripts/ai-smoke.ts`
- `package.json` — pinned @google/genai 1.52.0, added ai:smoke script
- `tests/server/cron.test.ts` — added double-reauth guard test

### Tests and checks run
- `npm run typecheck` → 0 errors
- `npm test` → 155/155 passed

### Blockers / unresolved issues
- **Sample photos not provided yet.** `npm run ai:smoke` will skip the verify step until `matching.jpg` and `non_matching.jpg` are placed in `tests/ai/samples/photos/`. The verify step is fully wired; just needs photo inputs.

### Needs from user before next phase
- Optionally: provide `tests/ai/samples/photos/matching.jpg` and `non_matching.jpg` to run the full smoke test including verify.
- For Phase 5 (Full flow + UI): no additional env vars or console steps needed. All env vars already set.

## Part C — Handoff for Phase 5

### Phase goal
Build the full order flow UI: order pages, checklist review/accept, photo upload, verdict display, ship, fit confirmation, receipt timeline.

**Done when:** one full order chat → released payment in sandbox locally (http://localhost:3000).

### Start state
- Branch: `main`, last commit: phase 4 (AI layer)
- Env vars: all set in `.env` (see `.env.example` for names)
- Services: `npm run dev` starts the app at http://localhost:3000

### Exact first steps
1. Read `CLAUDE.md`, `docs/decisions.md`, this file.
2. `git status` and `git log --oneline -5`.
3. `npm run typecheck && npm test` — must be 0 errors, 155 tests pass.
4. Plan the Phase 5 UI routes and components; use plan mode (required by skill).

### Known risks
- AI module imports use `__dirname` and `readFileSync` for prompts — this works in Node.js (server components, `runtime = "nodejs"`), but do NOT use these in client components or edge routes.
- `src/server/ai/images.ts` imports `@supabase/supabase-js` dynamically inside `downloadPhoto()` to avoid loading at module level in tests. Keep this pattern.
- Gemini free tier has low rate limits. In Phase 5, add error handling in route handlers for `NEEDS_MANUAL_REVIEW` returns.
- Phase 5 must wire `buildChecklist`, `writeChange`, `verifyPhotos`, `writeReceipt` through `orderService.ts` only (hard rule #4).
- Phase 5 must record a customer fit confirmation for every checkMethod="fit" item before capture, and the capture gate must require all photo items MET + all fit items confirmed.
- `verify.ts` now filters to `checkMethod === "photo"` items only; "fit" items are never sent to Gemini. The customer confirms fit items at the fit step after delivery.
- `ChecklistItemSchema` now requires `checkMethod: "photo" | "fit"`. All fixtures updated. Measurements (chest, length, sleeve, etc.) are always `checkMethod: "fit"`.

### Commands
- `npm run dev` — local at http://localhost:3000
- `npm run typecheck` — 0 errors expected
- `npm test` — 155 tests expected
- `npm run ai:smoke` — live Gemini call (requires GEMINI_API_KEY)
- `npm run paypal:smoke` — PayPal sandbox smoke test
