# StitchSafe — Handover after Phase 2 (Identity)
Date: 2026-11-09 · Next phase: 3 (Payments)

## Part A — Project summary
- Goal: AI payment agent for home/boutique tailors. Chat → checklist → PayPal authorize → AI photo check → capture after fit confirmation.
- Tagline: "Agree it, hold it, check it, release it." PayPal hackathon, USD sandbox, Render free, Supabase DB/storage.
- Deadline: Nov 12 2026.
- Status: Phases 0–2 done. Auth is wired (Resend magic link, Log in with PayPal, Firebase phone OTP). Domain core fully tested (97 tests). `/dashboard` protected, shows role + phone-verified badges.

## Part B — This session

### Done
- `src/server/db.ts` — Prisma singleton (PrismaPg pooler, port 6543)
- `src/server/auth/paypalProvider.ts` — custom Auth.js OAuth2 provider for PayPal sandbox
- `src/server/auth/auth.ts` — NextAuth config: Resend + PayPal providers, PrismaAdapter, session callback (injects `role`, `phoneVerified`)
- `src/server/auth/phone.ts` — firebase-admin v14 token verification (projectId-only init, no service account)
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handler (`runtime = "nodejs"`)
- `src/app/api/auth/phone/route.ts` — POST endpoint: verify Firebase token, update User row with `phoneNumber` + `phoneVerified=true`
- `src/proxy.ts` — updated from stub to full auth guard; redirects unauthenticated requests to `/login`
- `prisma/seed.ts` — upserts TAILOR user (`SEED_TAILOR_EMAIL`) and CUSTOMER user (`SEED_CUSTOMER_EMAIL`)
- `src/lib/firebase-client.ts` — client-side Firebase init from `NEXT_PUBLIC_FIREBASE_*` env vars
- `src/app/login/page.tsx` — email magic link + PayPal OAuth + phone OTP (send + verify flow)
- `src/app/dashboard/page.tsx` — server component, shows name/email, role badge, phone-verified badge, sign-out
- `src/app/page.tsx` — redirects `/` → `/dashboard`
- `src/types/next-auth.d.ts` — module augmentation adding `role: UserRole` and `phoneVerified: boolean` to Session

### Decisions made: none

### Files created / modified
- `src/server/db.ts` (new)
- `src/server/auth/paypalProvider.ts` (new)
- `src/server/auth/auth.ts` (new)
- `src/server/auth/phone.ts` (new)
- `src/app/api/auth/[...nextauth]/route.ts` (new)
- `src/app/api/auth/phone/route.ts` (new)
- `src/proxy.ts` (edited)
- `prisma/seed.ts` (edited)
- `src/lib/firebase-client.ts` (new)
- `src/app/login/page.tsx` (new)
- `src/app/dashboard/page.tsx` (new)
- `src/app/page.tsx` (edited)
- `src/types/next-auth.d.ts` (new)

### Fix-up (same session, after initial implementation)
- `src/proxy.ts` — added `export const config` matcher (excludes static/image/favicon paths)
- `src/server/auth/paypalProvider.ts` — auth URL changed to `${PAYPAL_WEB_BASE}/connect` with `flowEntry: "static"`; `checks: ["state"]`; `profile()` now resolves id from `payer_id ?? user_id`, email from `emails[]` with fallback, throws clearly if missing
- `prisma/schema.prisma` — added `roleChosen Boolean @default(false)` to User; migration `20261109113336_add_role_chosen` applied
- `src/server/auth/auth.ts` — session callback now also fetches `paypalVerified` (Account lookup) and `roleChosen`
- `src/types/next-auth.d.ts` — added `paypalVerified: boolean`, `roleChosen: boolean`
- `src/app/api/me/role/route.ts` (new) — POST sets `role` + `roleChosen = true`, calls `revalidatePath`
- `src/app/dashboard/page.tsx` — added PayPal verified badge, role-choice prompt (when `!roleChosen`), phone OTP form (when `!phoneVerified`)
- `src/app/dashboard/RoleChoiceForm.tsx` (new) — client component, two buttons POST to `/api/me/role`
- `src/app/dashboard/PhoneOtpForm.tsx` (new) — phone OTP flow moved from login; calls `router.refresh()` on success
- `src/app/login/page.tsx` — stripped to magic link + PayPal only (phone OTP removed)
- `prisma/seed.ts` — both upserts now set `roleChosen: true`

### Tests and checks run
- `npm run typecheck` → 0 errors ✅
- `npm test` → 97 passed (3 files) ✅

### Blockers / unresolved issues
- **`npm run db:generate` must be run** before Phase 3 code can import `@/generated/prisma/client`
- Resend only delivers to `gsaikalyan2@gmail.com` — email login only works for that address in dev
- Firebase phone auth requires `http://127.0.0.1:3000` (not `localhost`)
- Phase 2 UI is functional but minimal — Phase 5 will style it

### Needs from user before Phase 3
Confirm `.env.local` has all Phase 2 vars: `AUTH_URL=http://127.0.0.1:3000`, `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_TRUST_HOST=true`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_API_BASE`, `PAYPAL_WEB_BASE`, `DATABASE_URL` (pooler port 6543), `DIRECT_URL` (port 5432), `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_*`, `SEED_TAILOR_EMAIL`, `SEED_CUSTOMER_EMAIL`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.

Then run:
```
npm run db:generate
npm run db:seed
```

## Part C — Handoff for Phase 3 (Payments)

### Phase goal
Build PayPal Orders v2 integration: token cache, create (AUTHORIZE), authorize, capture, void, reauthorize, `PayPal-Request-Id`, button, cron endpoint.

**Done when**: `npm run paypal:smoke` runs authorize→capture and authorize→void with IDs stored.

### Start state
- Branch: `main`
- Last commit: phase 2 commit (see git commands below)
- Env vars: all Phase 2 vars above, plus `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
- Services: Supabase dev project running, `npm run db:generate` already done

### Exact first steps for next session
1. Read `CLAUDE.md`, `docs/decisions.md`, this file
2. Run `git log --oneline -5` and `git status`
3. Confirm `src/generated/prisma/` exists; if not run `npm run db:generate`
4. Begin Phase 3: `src/server/paypal/client.ts` (token cache + `PayPal-Request-Id` helper), then `orders.ts`, then `authorizations.ts`

### Known risks
- **Prisma client not generated**: `src/generated/prisma/` is gitignored; run `npm run db:generate` before any import
- **PayPal sandbox only**: ensure `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` are sandbox credentials
- **`PayPal-Request-Id` idempotency**: every POST must send a deterministic ID per CLAUDE.md hard rule 3 (e.g. `authorize-<paymentId>`)
- **Only `orderService.ts` moves money**: route handlers must never call PayPal directly (hard rule 4)

### Commands
```
npm run dev          # http://127.0.0.1:3000
npm run typecheck    # must pass (0 errors)
npm test             # must pass (97 tests)
npm run paypal:smoke # Phase 3 done-when check
npm run db:generate  # after any schema change
npm run db:seed      # seed tailor + customer
```
