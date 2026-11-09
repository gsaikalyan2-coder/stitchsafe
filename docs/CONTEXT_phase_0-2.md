# StitchSafe — Context handoff (Phases 0–2 complete) — 2026-11-09

Paste this into a new Claude Code / Claude chat to continue. Source of truth in the repo:
`CLAUDE.md`, `docs/decisions.md`, `docs/handover_phase_{0,1,2}.md`, `docs/StitchSafe build plan and stack.md`.
Never read or print `.env` / `.env.demo` (secrets). Use `.env.example` for variable names.

## 1. Project in one paragraph
StitchSafe = AI payment agent (escrow) for home/boutique tailors, built for the PayPal hackathon.
Flow: order chat -> AI checklist (both sides accept) -> PayPal **AUTHORIZE** hold -> tailor uploads outfit
photos -> AI marks each item MET / PARTLY_MET / NOT_MET -> shipped -> customer confirms fit -> **CAPTURE**
(or **VOID** on cancel). **Deadline: Nov 12 2026.** USD, PayPal sandbox. Owner: Saikalyan
(repo https://github.com/gsaikalyan2-coder/stitchsafe, local `C:\Users\saika\StitchSafe-PayTm`, Windows + PowerShell).

## 2. Locked decisions (do not change without the user)
- Platform sandbox merchant receives funds (tailor payout = future work). Every order `intent: AUTHORIZE`.
- Add-on = **separate** PayPal order + authorization for the add-on amount only; one add-on request, max 3 counter-offers.
- Both sides accept every checklist version. Original price locked.
- Discount: 10% (1000 bps) on BASE lines only, first order between this customer and this tailor; tailor may set 0–30%; snapshot on version 1.
- Photo check: any PARTLY_MET/NOT_MET blocks capture; tailor gets 2 re-upload rounds, then customer chooses accept-anyway or cancel (void).
- Silent customer: after SHIPPED, 7 days to confirm fit, else server auto-captures on day 25 of the authorization unless DISPUTED.
- Reauthorize after the 3-day honor period via cron (GitHub Actions -> POST /api/cron/reauthorize); auth max 29 days.
- Cancel = void all live authorizations. "Report a problem" -> DISPUTED (blocks capture and void; resolver = future work).
- Chat = polling every 3 s. AI never sets prices; server `src/domain/pricing.ts` computes all totals; integer cents.
- **AI provider = Google Gemini (AI Studio key, free tier)**, not Claude: `GEMINI_MODEL_VISION=gemini-3.8-flash`
  (checklist builder, photo checker), `GEMINI_MODEL_VISION_FALLBACK=gemini-3.6-flash` (on 503/429),
  `GEMINI_MODEL_FAST=gemini-3.5-flash-lite` (change writer, receipt writer). All provider code in `src/server/ai/client.ts`.
  Free tier: Google may use inputs -> demo photos only. Key tested: all three models respond (503s are transient overloads).
- **Deployment deferred to Phase 7** (first Render deploy, Singapore, demo Supabase). Phases 0–6 verified locally.
- **Local dev URL is always `http://localhost:3000`** (`npm run dev`, no `-H`). Next.js 16 normalises 127.0.0.1 to
  localhost inside NextRequest.url, so Auth.js builds redirect_uri with localhost.

## 3. Accounts / infrastructure (all set up; values live in .env / .env.demo)
| Service | State |
|---|---|
| PayPal sandbox app "StitchSafe" | Client ID starts `BAAQQV8s…`; Log in with PayPal enabled; Return URL `http://localhost:3000/api/auth/callback/paypal`; sandbox buyer `sb-vue2i53752054@personal.example.com` (password in .env as PAYPAL_SANDBOX_BUYER_PASSWORD) |
| Supabase | `stitchsafe-dev` (ref joxelocddsrmcvcwisdl) and `stitchsafe-demo` (ref lsqbeggiuzaiplalkwha), Singapore; private bucket `stitchsafe-photos` (5 MB, jpg/png/webp) in both; Prisma via session pooler 5432 (DIRECT_URL) + transaction pooler 6543 (DATABASE_URL, pgbouncer=true). Password `$` is URL-encoded `%24` |
| Firebase | project `stitchsafe-48661`, Spark plan; Phone sign-in enabled; SMS region policy allows US; test numbers +16505551234/123456 and +16505555678/654321; authorized domain localhost. **No service account** (key creation blocked by org policy) -> firebase-admin initialised with projectId only |
| Resend | key set; sender onboarding@resend.dev; only delivers to gsaikalyan2@gmail.com |
| Gemini | AI Studio key set (starts `AQ.`) |
| Render | account only; service created in Phase 7 from render.yaml (region singapore) |
| GitHub | public repo, main branch |

## 4. Phase 0 — Foundation (done, commit f3823f6)
- Next.js 16.4.5 App Router, TS strict, Tailwind 4, `src/`, no Cache Components. Exact pins: prisma/@prisma/client/@prisma/adapter-pg 7.10.1
  (never upgrade to 8 RC), next-auth 5.0.0-beta.32, firebase 13.2.0, firebase-admin 14.5.0, vitest 5.1.0.
- `prisma.config.ts` uses `defineConfig` + `datasource.url: env("DIRECT_URL")`, migrations path, seed `tsx prisma/seed.ts`.
  Schema datasource has **no url** (Prisma 7). Runtime client: `new PrismaPg({ connectionString: DATABASE_URL })` in `src/server/db.ts`; generated client in `src/generated/prisma` (gitignored; run `npm run db:generate`).
- Migration `initial_schema` applied to dev. `/api/health` returns 200. `render.yaml` (free, singapore, build runs `prisma generate` + `migrate deploy`).
- Claude Code setup: `.claude/settings.json` (allowlist; deny reading .env/.env.demo; deny force push),
  hooks `.claude/hooks/protect-files.mjs` (blocks edits to .env*, migrations, .git) and `verify.mjs` (Stop hook: typecheck + tests),
  skill `.claude/skills/stitchsafe-phase/SKILL.md` (`/stitchsafe-phase N`).

## 5. Phase 1 — Domain core (done, commit ce8e689) — 97 Vitest tests pass
- `src/domain/pricing.ts`: PricingError; `computeOrderTotals(lines, {percentBps, eligible})` (discount on BASE only, round half up
  `floor((base*bps+5000)/10000)`), `computeAddOnTotals` (isLargeJump at >= 5000 bps), `toPayPalAmount` / `toPayPalAddOnAmount`
  return full `{currency_code:"USD", value, breakdown{item_total, handling=rush, shipping, tax_total=customs, discount}}`. Example $180+$20+$25+$10−$18 = 217.00.
- `src/domain/orderMachine.ts`: states DRAFT, PROPOSED, AGREED, AUTHORIZED, IN_PROGRESS, SUBMITTED, CHECK_PASSED, CHECK_FAILED,
  SHIPPED, RELEASED, CANCELLED, VOIDED, DISPUTED. `canTransition(from,to,{reUploadRounds})` + `canActorTransition(from,to,actor)` with
  Actor = CUSTOMER | TAILOR | SYSTEM (AUTHORIZED: customer; IN_PROGRESS/SUBMITTED/SHIPPED: tailor; CHECK_*: system; accept-anyway: customer;
  RELEASED: customer or system; AGREED: system; cancel/void/dispute: customer or tailor). DISPUTED is a dead end (by design for MVP).
- `src/domain/versioning.ts`: isAccepted, needsAcceptance, bumpVersion, `diffChecklist(prev,next)` -> {added, removed, changed}.

## 6. Phase 2 — Identity (done, commit 5dc47f3) — manual tests A/B/C pass
- Auth.js v5 + PrismaAdapter, database sessions (`src/server/auth/auth.ts`); session exposes role, phoneVerified, paypalVerified (has paypal Account), roleChosen.
- Resend magic link (tailor). Custom PayPal OAuth provider (`src/server/auth/paypalProvider.ts`): authorize `${PAYPAL_WEB_BASE}/connect`
  with `flowEntry=static`, scope `openid email profile https://uri.paypal.com/services/paypalattributes`, `checks:["state"]`,
  token `/v1/oauth2/token`, **userinfo custom request to `/v1/identity/oauth2/userinfo?schema=paypalv1.1`** (old openidconnect path returned empty body),
  profile maps primary `emails[]`, id = payer_id ?? user_id, `allowDangerousEmailAccountLinking: true` (seeded users).
- Firebase phone OTP on `/dashboard` (`PhoneOtpForm.tsx`, single reused RecaptchaVerifier, shows Firebase error codes) -> POST `/api/auth/phone` -> firebase-admin verifyIdToken -> phoneVerified.
- Role choice once (`roleChosen` field, migration `add_role_chosen`, POST `/api/me/role`). Seed: tailor gsaikalyan2@gmail.com, customer = sandbox buyer email.
- `src/proxy.ts`: matcher skips static assets; `/login` redirects signed-in users to `/dashboard` (otherwise Auth.js links a new provider to the CURRENT user);
  unauthenticated users -> /login. Login page shows `?error=` and is wrapped in Suspense.
- Verified DB state: tailor phone +16505551234 verified, no PayPal; customer phone +16505555678 verified, PayPal linked.
- Lessons: test each role in its own window (tailor normal, customer Incognito), sign out between roles; always use localhost.

## 7. Next: Phase 3 — Payments (not started)
Goal: `src/server/paypal/*` (token cache, create order AUTHORIZE with toPayPalAmount, authorize, capture, void, reauthorize,
PayPal-Request-Id on every call), PayPal button (`@paypal/react-paypal-js` 10.1.2, PayPalScriptProvider intent "authorize", currency USD),
cron route `/api/cron/reauthorize` (Bearer CRON_SECRET; also day-25 auto-capture), `scripts/paypal-smoke.ts`.
Done when: `npm run paypal:smoke` runs authorize->capture and authorize->void with IDs stored. Then a second-session review of
`src/server/paypal` + orderService against docs/decisions.md before commit.
Start with: `/clear` then `/stitchsafe-phase 3` (use plan mode; read docs/decisions.md first).

## 8. Working protocol
One phase per session; plan mode for 0/1/5/6 and anything touching money; after each phase: typecheck + tests (Stop hook enforces),
`docs/handover_phase_N.md` (Parts A/B/C), commit with `git add -A` + check `git status --short | Select-String '\.env$|\.env\.demo|node_modules'` prints nothing,
then wait for the user's confirmation before the next phase. Remaining phases: 3 Payments · 4 AI (Gemini) · 5 Full flow + UI · 6 Add-ons/chat/trust page · 7 Deploy + ship.
