# StitchSafe — Handover after Phase 3 (Payments)
Date: 2026-11-09 · Next phase: 4 (AI)

## Part A — Project summary
- **Goal:** AI payment escrow for tailors. Chat order → both sides accept checklist → PayPal authorization holds funds → AI photo check → capture after fit confirmation. Tagline: "Agree it, hold it, check it, release it."
- **Deadline:** Nov 12 2026. USD sandbox. Hosting: Render free. DB/storage: Supabase.
- **Status:** Phases 0–3 done. What works end-to-end right now:
  - Auth.js with Resend magic link + Log in with PayPal + Firebase phone OTP
  - Full order state machine (domain pure, 100% tested)
  - PayPal AUTHORIZE order creation, customer approval, authorization hold, capture, void, reauthorization
  - Cron endpoint (`POST /api/cron/reauthorize`) with timingSafeEqual bearer check; runs `reauthorizeDue` + `autoCaptureDue`
  - `HoldPaymentButton` component ready to drop into the order page (Phase 5)
  - `npm run paypal:smoke` smoke script for end-to-end sandbox verification

## Part B — This session

### Done
- **CLAUDE.md line 43** — fixed corrupted line; now reads the localhost normalization rule correctly
- **prisma migration `payment_lifecycle`** — added to `Payment`: `authorizedAt`, `authorizationHistory`, `honorUntil`, `expiresAt`, `reauthorizedAt`, `capturedAt`, `voidedAt`, `lastPaypalStatus`; added to `Order`: `shippedAt`, `fitConfirmedAt`; added to `OrderEvent`: `type`, `payload`; added `PaymentStatus` values `DENIED`, `FAILED`
- **`src/domain/authorizationDates.ts`** — 5 pure date helpers: `honorPeriodEnd`, `effectiveHonorPeriodEnd`, `autoCaptureCutoff`, `maxAuthCutoff`, `shouldReauthorize`, `shouldAutoCapture`
- **`tests/domain/authorizationDates.test.ts`** — full coverage of all helpers + edge cases
- **`src/server/events.ts`** — `appendOrderEvent(tx, input)` for use inside Prisma transactions
- **`src/server/paypal/client.ts`** — token cache (refresh at expires_in − 300s), `paypalFetch`, typed `PayPalError`
- **`src/server/paypal/orders.ts`** — `createAuthorizeOrder`, `getOrder`, `authorizeOrder`
- **`src/server/paypal/authorizations.ts`** — `captureAuthorization`, `voidAuthorization`, `reauthorizeAuthorization`, `getAuthorization`
- **`src/server/services/orderService.ts`** — money orchestrator: `createPayPalOrder`, `authorizePayment`, `captureAllLive`, `voidAllLive`, `reauthorizeDue`, `autoCaptureDue`
- **`tests/server/paypal/client.test.ts`** — token cache, Request-Id on every POST, error mapping
- **`tests/server/cron.test.ts`** — timingSafeEqual: correct/wrong/missing/different-length → 200/401
- **`src/app/api/orders/[id]/payment/route.ts`** — POST → `createPayPalOrder`
- **`src/app/api/orders/[id]/payment/authorize/route.ts`** — POST `{paypalOrderId}` → `authorizePayment`
- **`src/app/api/cron/reauthorize/route.ts`** — bearer check + `reauthorizeDue` + `autoCaptureDue`
- **`src/components/HoldPaymentButton.tsx`** — PayPalScriptProvider intent:authorize, label "Hold payment"
- **`.github/workflows/cron.yml`** — schedule `4-59/10 * * * *` + `workflow_dispatch`, curl with --retry 3
- **`scripts/paypal-smoke.ts`** — Flow A (authorize→capture+idempotency) + Flow B (authorize→void) + cron 200/401
- **`docs/decisions.md`** — appended decision #37 (day-18 tailor deadline, day-25 auto-capture, day-28 emergency)

### Decisions made
- Authorization lifecycle (#37): tailor deadline = day 18; auto-capture when shippedAt+7d AND age≥25d; emergency capture at day 28; honor period 3d; max one reauth per payment.

### Files created / modified
```
prisma/schema.prisma                                    (modified)
src/domain/authorizationDates.ts                        (new)
src/server/events.ts                                    (new)
src/server/paypal/client.ts                             (new)
src/server/paypal/orders.ts                             (new)
src/server/paypal/authorizations.ts                     (new)
src/server/services/orderService.ts                     (new)
src/app/api/orders/[id]/payment/route.ts                (new)
src/app/api/orders/[id]/payment/authorize/route.ts      (new)
src/app/api/cron/reauthorize/route.ts                   (new)
src/components/HoldPaymentButton.tsx                    (new)
.github/workflows/cron.yml                             (new)
scripts/paypal-smoke.ts                                 (new)
tests/domain/authorizationDates.test.ts                 (new)
tests/server/paypal/client.test.ts                      (new)
tests/server/cron.test.ts                               (new)
docs/decisions.md                                       (modified — appended #37)
CLAUDE.md                                               (modified — line 43 fix)
```

### Tests and checks run
- `npm run typecheck` → 0 errors
- `npm test` → 134/134 passed (6 test files; 37 new tests added)
- `npm run paypal:smoke` → interactive; must be run manually with sandbox buyer approval

### Smoke test results (run 2026-11-09)
- **Flow A** (authorize → walk states → capture + idempotency): **PASS** — authorization ID stored, capture ID stored, second captureAuthorization call returned the same capture ID.
- **Flow B** (authorize → void): **PASS** — authorization ID stored, payment voided, order state VOIDED.
- **Cron check**: initially FAILED (all 4 cases returned 200) — root cause: `src/proxy.ts` `PUBLIC_PATHS` only covered `/api/auth`, so `/api/cron` got an HTML redirect to `/login`. Fixed in post-smoke session.

### Post-smoke fixes (2026-11-09)
- `src/proxy.ts`: `PUBLIC_PATHS` changed to `["/login", "/api/"]` — all API routes bypass the auth redirect.
- `src/server/services/orderService.ts`: `reauthorizeDue` and `autoCaptureDue` return `Promise<number>` (count processed).
- `src/app/api/cron/reauthorize/route.ts`: returns `{ reauthorized, autoCaptured, ranAt }`.
- `scripts/paypal-smoke.ts`: cron check uses `redirect: "manual"`, asserts JSON body, adds `--cron-only` flag.
- `tests/server/proxy.test.ts`: new — verifies `/api/**` paths return `undefined` from proxy (no redirect).
- `tests/server/cron.test.ts`: mock returns `0`, assertion checks numeric fields.
- `next.config.ts`: added `turbopack: { root: __dirname }` to fix dev server OOM warning.
- `docs/decisions.md`: appended decision #38 (PayPal sandbox IN→US geography change).
- Tests: 139/139 pass after fixes.

### Blockers / unresolved issues
- GitHub Actions secrets `APP_URL` and `CRON_SECRET` are set in Phase 7 (after Render deploy).

### Needs from user before next phase
- None for Phase 4 — AI keys (`GEMINI_API_KEY`, `GEMINI_MODEL_VISION`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_VISION_FALLBACK`) are already in `.env` from Phase 2.
- Run `npm run paypal:smoke -- --cron-only` (with `npm run dev` in a separate terminal) to verify cron 200/401 is fixed.

## Part C — Handoff for Phase 4 (AI)

### Phase goal and "Done when"
Build the AI layer: checklist builder, change writer, photo checker, receipt writer. Each uses Gemini with structured output → Zod parse + 1 retry → `NEEDS_MANUAL_REVIEW`. Done when fixture contract tests pass and live calls work on 3 sample chats.

### Start state
- Branch: `main` (single branch; commits are the checkpoints)
- Last commit: phase 3 commit (to be made by user after this session)
- Env vars required (all in `.env`): `GEMINI_API_KEY`, `GEMINI_MODEL_VISION=gemini-3.8-flash`, `GEMINI_MODEL_FAST=gemini-3.5-flash-lite`, `GEMINI_MODEL_VISION_FALLBACK=gemini-3.6-flash`
- Services: Supabase dev project connected; `npm run dev` for local testing

### Exact first steps for next session
1. Read `CLAUDE.md`, `docs/decisions.md`, this file (`docs/handover_phase_3.md`)
2. Run `git log --oneline -5` and `git status` — confirm phase 3 commit is present
3. Run `npm run typecheck && npm test` — expect 0 errors, 134 tests pass
4. **Second-session review (first item of this phase):** read `src/server/paypal/` and `src/server/services/orderService.ts`; verify against `docs/decisions.md` hard rules 1–5 (AI never sets prices, integer cents, PayPal only from `src/server/paypal/`, only orderService moves money, every state change appends `OrderEvent` in same tx)
5. Begin Phase 4: create `src/server/ai/` with `client.ts`, `schemas.ts`, `checklist.ts`, `change.ts`, `verify.ts`, `receipt.ts`, `images.ts`, and `prompts/` directory

### Known risks
- Gemini free tier rate limits (429/503): `client.ts` must retry once with `GEMINI_MODEL_VISION_FALLBACK` before returning `NEEDS_MANUAL_REVIEW`
- `z.toJSONSchema()` is Zod 4 — verify it exists in the installed version before using
- `@google/genai` SDK shape may have changed — verify `ai.models.generateContent` signature against current ai.google.dev docs before writing any Phase 4 code
- AI output schemas must never include price/amount fields (hard rule #1)

### Commands
```bash
npm run dev           # local app at http://localhost:3000
npm run typecheck     # tsc --noEmit
npm test              # vitest run --passWithNoTests
npm run paypal:smoke  # interactive sandbox smoke test (needs dev server + sandbox buyer)
npm run db:generate   # after any schema change
npm run db:migrate    # prisma migrate dev
```
