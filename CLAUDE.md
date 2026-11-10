# StitchSafe

AI payment agent for home and boutique tailors. A chat order becomes a checklist both sides accept; a PayPal authorization holds the customer's money; AI checks photos of the finished outfit against the checklist; the server captures only after the check passes and the customer confirms fit, and voids on cancel. Tagline: "Agree it, hold it, check it, release it." PayPal hackathon build: USD sandbox, single platform merchant, submission Nov 12 2026.

## Hard rules (never break)

1. AI never sets prices. AI output schemas contain no money amounts. Amounts come from tailor input and `src/domain/pricing.ts` only.
2. Money is integer cents (`amountCents`, safe integers). Convert to PayPal strings only with `formatCents` / `toPayPalAmount` / `toPayPalAddOnAmount`.
3. PayPal is called only from `src/server/paypal/**`. Every POST sends a `PayPal-Request-Id` that is deterministic per action (e.g. `authorize-<paymentId>`, `capture-<paymentId>`); PayPal honours it for 6 hours.
4. Only `src/server/services/orderService.ts` combines domain + PayPal + AI + DB, and only after `canTransition()` from `src/domain/orderMachine.ts` allows it. Route handlers never call PayPal or AI directly. AI modules return data; they never move money.
5. Every order state change appends an `OrderEvent` (via `src/server/events.ts`) in the same Prisma transaction.
6. AI calls: structured output → Zod parse + business checks → retry once → `NEEDS_MANUAL_REVIEW`. An AI failure never captures, voids or changes a total.
7. No secrets in code, logs, fixtures, screenshots or commits. When you add an env var, add its name to `.env.example` in the same change. Never edit `.env` or `.env.local`.
8. Business policy comes from `docs/decisions.md`. Do not invent policy. If something is undecided, stop and ask.

IMPORTANT: rules 1-6 protect money flows. If a task seems to need breaking one, stop and ask the user.

## Stack (pinned; do not upgrade during the hackathon)

- Next.js 16.4.5 App Router, React 19.2, TypeScript strict, Tailwind CSS 4.3.5. Frontend and backend in one app. Node >= 20.19.
- Prisma 7.10.1: `prisma`, `@prisma/client`, `@prisma/adapter-pg` all exactly 7.10.1. Never `npm i prisma` without a version (latest is the 8.0 RC).
- Supabase Postgres (dev and demo projects, no SQLite). Supabase Storage private bucket `stitchsafe-photos` (`@supabase/supabase-js` 2.119.0).
- Auth.js: `next-auth@5.0.0-beta.32` + `@auth/prisma-adapter@2.11.3`. Never `npm i next-auth` without a version (latest is v4). Resend magic link (`resend` 6.37.0) + custom PayPal OAuth provider (Log in with PayPal).
- Phone OTP: Firebase phone auth with test numbers (`firebase` 13.2.0 client); server verifies the ID token with `firebase-admin` 14.5.0 initialised with `{ projectId: FIREBASE_PROJECT_ID }` only — NO service account (key creation is blocked by org policy). `verifyIdToken` needs only the project ID; do not add FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.
- AI: Google Gemini via an AI Studio key (free tier). `@google/genai` (exact version pinned in package.json) + Zod 4 + `sharp`. `GEMINI_MODEL_VISION=gemini-3.8-flash` (checklist builder, photo checker); `GEMINI_MODEL_FAST=gemini-3.5-flash-lite` (change writer, receipt writer). On a 503/429 from the vision model, `client.ts` retries once with `GEMINI_MODEL_VISION_FALLBACK=gemini-3.6-flash` before marking NEEDS_MANUAL_REVIEW. All provider-specific code lives in `src/server/ai/client.ts`, so the provider can be swapped back to Claude by changing that file and the env vars.
- Payments: PayPal Orders v2 + Payments v2 REST via `fetch`. Buttons: `@paypal/react-paypal-js` 10.1.2, legacy `PayPalScriptProvider` with `intent: "authorize"`, `currency: "USD"`; the server creates every order with `intent: "AUTHORIZE"`.
- Chat: SWR polling every 3 s on `/api/orders/[id]/messages`.
- Scheduler: GitHub Actions cron → `POST /api/cron/reauthorize` with `Authorization: Bearer $CRON_SECRET`.
- Tests: Vitest 5.1.0, Playwright 1.65.0, Postman collection run by Newman 6.2.3 (deprecated) or Postman CLI.
- Hosting: Render free web service from `render.yaml`. Repo: public GitHub, MIT.
- Repo: https://github.com/gsaikalyan2-coder/stitchsafe (public, created empty; branch `main`). Remote: `git remote add origin https://github.com/gsaikalyan2-coder/stitchsafe.git`.

## Framework gotchas

- Next 16: route protection lives in `src/proxy.ts` exporting `proxy()` (Node runtime). There is no `middleware.ts`.
- Next 16: `params`, `searchParams`, `cookies()`, `headers()` are async. Route handler: `const { id } = await ctx.params`.
- Cache Components are OFF. Do not add `"use cache"`. `next lint` no longer exists; use `npm run lint`.
- Route handlers that touch Prisma, the Gemini SDK (`@google/genai`), firebase-admin or sharp start with `export const runtime = "nodejs";`.
- Prisma 7: the CLI URL lives in `prisma.config.ts` (`DIRECT_URL`, port 5432, imports `dotenv/config`). The runtime client uses `new PrismaPg({ connectionString: DATABASE_URL })` (pooler, port 6543). Generator `prisma-client` outputs to `src/generated/prisma` (gitignored); import from `@/generated/prisma/client`.
- Prisma 7: `migrate dev` does not run `generate` or seed. Run `npm run db:generate` after every schema change.
- `NEXT_PUBLIC_*` values are inlined at build time; on Render they must exist before the build.
- Gemini: call `ai.models.generateContent` with `config.responseMimeType: "application/json"` and `config.responseJsonSchema` built from `z.toJSONSchema(Schema)`, then `Schema.parse(JSON.parse(response.text))`. Treat a block/SAFETY/MAX_TOKENS finish or a parse failure like a bad output: retry once, then NEEDS_MANUAL_REVIEW. Images go as `inlineData` base64 JPEG after server download, EXIF strip and resize (long edge <= 1568 px). Free tier: low rate limits (check AI Studio) and Google may use inputs to improve its products, so only sample photos. Verify SDK shapes against current ai.google.dev docs before writing Phase 4 code.
- Local dev URL is ALWAYS `http://localhost:3000` (run `npm run dev`, no `-H`). Next.js 16 normalises 127.0.0.1 to localhost in `NextRequest.url`, so Auth.js builds `redirect_uri` with localhost; the PayPal Log in return URL is `http://localhost:3000/api/auth/callback/paypal`. Always use `http://localhost:3000`; never use 127.0.0.1.
- Resend without a verified domain only delivers to the Resend account owner's email. Render free blocks SMTP ports; always use the Resend HTTPS API.

## Layout

```
src/
  app/                 pages; app/api/** route handlers (thin: Zod -> session -> orderService -> JSON)
  proxy.ts             auth gate for app pages
  domain/              pricing.ts, orderMachine.ts, versioning.ts (pure, no I/O, fully unit-tested)
  server/
    db.ts              Prisma singleton (PrismaPg adapter)
    events.ts          appendOrderEvent(tx, ...)
    paypal/            client.ts (token cache, request id), orders.ts, authorizations.ts
    ai/                client.ts, schemas.ts, images.ts, checklist.ts, change.ts, verify.ts, receipt.ts, prompts/
    storage/           supabase.ts (signed upload/read URLs, 5 MB, jpg/png/webp)
    auth/              auth.ts (Auth.js), paypalProvider.ts, phone.ts (firebase-admin)
    services/          orderService.ts (the ONLY orchestrator)
  generated/prisma/    Prisma client output (gitignored)
prisma/                schema.prisma, migrations/, seed.ts
prisma.config.ts
tests/                 domain/, ai/ (+ fixtures/), e2e/
postman/               stitchsafe.postman_collection.json, local + render environments
scripts/               paypal-smoke.ts
docs/                  decisions.md, handover_phase_N.md
.github/workflows/     cron.yml
render.yaml
```

## Commands

- `npm run dev`: local app at http://localhost:3000
- `npm run typecheck`: `tsc --noEmit`
- `npm test`: Vitest (`vitest run --passWithNoTests`)
- `npm run lint`: eslint CLI
- `npm run e2e`: Playwright happy path
- `npm run api:test`: Postman collection via Newman (`postman collection run` also works)
- `npm run paypal:smoke`: sandbox authorize->capture and authorize->void
- `npm run db:migrate` (prisma migrate dev), `npm run db:generate` (prisma generate), `npm run db:seed` (tsx prisma/seed.ts)
- Render build: `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`; start: `npm start`

## Order state machine

`DRAFT -> PROPOSED -> AGREED -> AUTHORIZED -> IN_PROGRESS -> SUBMITTED -> CHECK_PASSED | CHECK_FAILED -> SHIPPED -> RELEASED`

- CHECK_FAILED -> SUBMITTED on re-upload, at most 2 re-upload rounds; then the customer chooses accept-anyway (-> CHECK_PASSED) or cancel (-> VOIDED).
- Any PARTLY_MET or NOT_MET verdict blocks capture.
- Side exits: CANCELLED (before any authorization), VOIDED (cancel after authorization: void every live authorization), DISPUTED (report a problem: blocks capture and void).
- Capture every live authorization (original + add-on) after SHIPPED + customer fit confirmation, or by the cron auto-capture rule in `docs/decisions.md`.

## Testing expectations

- Domain changes ship with Vitest tests in the same change.
- PayPal runs against sandbox only (`PAYPAL_API_BASE=https://api-m.sandbox.paypal.com`). Negative cases use the `PayPal-Mock-Response` header.
- AI: contract tests on saved fixtures in `tests/ai/fixtures`; one live smoke call per prompt, run by hand.
- Before claiming anything is done: `npm run typecheck && npm test` pass; show the output.

## Phase protocol

- Phases: 0 Foundation, 1 Domain core, 2 Identity, 3 Payments, 4 AI, 5 Full flow + UI, 6 Winning features, 7 Ship.
- One phase per session. Run `/stitchsafe-phase N` (`.claude/skills/stitchsafe-phase/SKILL.md`). `/clear` between phases.
- Start: read this file, `docs/decisions.md`, and the latest `docs/handover_phase_*.md`. Use plan mode for Phase 0, orderMachine, orderService wiring and add-ons.
- End: write `docs/handover_phase_N.md` (Part A project summary, Part B session summary, Part C self-contained handoff), print git commit commands, update "Current phase" below, then STOP and wait for the user to confirm before the next phase.
- When compacting, keep: current phase, list of modified files, failing tests, and the commands above.

## Current phase

Phase 5 — Full flow + UI (not started)
