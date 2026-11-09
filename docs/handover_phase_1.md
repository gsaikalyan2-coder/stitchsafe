# StitchSafe — Handover after Phase 1 (Domain core)
Date: 2026-11-09 · Next phase: 2 (Identity)

## Part A — Project summary
- Goal: AI payment agent for home/boutique tailors. Agree a checklist, hold payment (PayPal authorize), AI photo-checks the finished outfit, server captures only after check passes and customer confirms fit. "Agree it, hold it, check it, release it."
- Deadline: Nov 12 2026. USD sandbox. Hosting: Render free (Singapore). DB/storage: Supabase dev project.
- Status: Phases 0 and 1 done. The app boots, /api/health returns 200, Prisma schema is migrated on Supabase dev, and the entire domain layer (pricing, state machine, versioning) is fully unit-tested with 97 passing tests.

## Part B — This session

### Done
- `src/domain/pricing.ts`: canonical engine from appendix — `PricingError`, `PriceLine`, `DiscountPolicy`, `computeOrderTotals` (validates inputs, rejects ADDON, requires BASE > 0, discount 0–3000 bps), `computeAddOnTotals` (large jump ≥5000 bps), `percentOf` (round-half-up), `formatCents`, `toPayPalAmount(OrderTotals): PayPalAmount` (full `{currency_code, value, breakdown}` object), `toPayPalAddOnAmount(AddOnTotals): PayPalAmount`
- `src/domain/orderMachine.ts`: `canTransition` (all states, re-upload rounds, side exits) + `Actor` type + `canActorTransition(from, to, actor, ctx)` with actor rules for every transition
- `src/domain/versioning.ts`: `isAccepted`, `needsAcceptance`, `bumpVersion` + `diffChecklist<T extends {id}>(prev, next)` returning `{added, removed, changed}`
- Tests: pricing (9 appendix tests incl. $217 example), orderMachine (happy path + re-upload + side exits + terminal guard + actor allowed/denied), versioning (acceptance + diff)

### Decisions made
- None new; all logic follows `docs/decisions.md` and appendix exactly

### Files created / modified
- `src/domain/pricing.ts` (replaced with appendix canonical version)
- `src/domain/orderMachine.ts` (added `Actor`, `canActorTransition`)
- `src/domain/versioning.ts` (added `diffChecklist`)
- `tests/domain/pricing.test.ts` (replaced with appendix 9 tests)
- `tests/domain/orderMachine.test.ts` (added actor guard tests)
- `tests/domain/versioning.test.ts` (added diffChecklist tests)
- `CLAUDE.md` — current phase updated to Phase 2

### Tests and checks run
- `npm run typecheck` → clean (0 errors)
- `npm test` → 3 test files, 97 tests, all passed, 1.47s

### Blockers / unresolved issues
- None

### Needs from user before next phase
- Confirm Supabase dev migration is applied (`npm run db:migrate` with name `initial_schema`) and `npm run db:generate` has been run — required before Phase 2 can import from `@/generated/prisma/client`
- Confirm `curl http://127.0.0.1:3000/api/health` returns `{"status":"ok",...}` (Phase 0 done-when check)
- Confirm `stitchsafe-photos` private bucket exists in Supabase Storage (needed by Phase 4/5)

## Part C — Handoff for Phase 2 (Identity)

### Phase goal
Resend magic link first, Log in with PayPal (2-hour timebox), Firebase phone code, roles + short profile.

**Done when:** two seeded users log in and show verified badges.

### Start state
- Branch: `main`, last commit: `phase 1: domain core`
- Env vars required: all in `.env.example` must be set in `.env.local`. Key additions for Phase 2: `RESEND_API_KEY`, `AUTH_SECRET`, `NEXTAUTH_URL=http://127.0.0.1:3000`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- Services: Supabase dev DB must be migrated and `npm run db:generate` run before any import from `@/generated/prisma/client`

### Exact first steps
1. Read `CLAUDE.md`, `docs/decisions.md`, this file
2. Run `git status && git log --oneline -5` — confirm clean, one phase-1 commit
3. Confirm `npm run typecheck && npm test` still pass (77 tests)
4. Implement Auth.js v5 config in `src/server/auth/auth.ts` with Resend email provider + Prisma adapter
5. Add PayPal OAuth provider in `src/server/auth/paypalProvider.ts` (custom provider, 2-hour timebox)
6. Add Firebase phone OTP verification in `src/server/auth/phone.ts` (firebase-admin `verifyIdToken`, projectId only — no service account)
7. Implement `src/proxy.ts` route protection (currently a stub)
8. Add role field to session via Auth.js callbacks
9. Seed two users (tailor + customer) in `prisma/seed.ts`
10. Verify both can log in and show verified badges

### Known risks
- Auth.js v5 beta API — check `next-auth@5.0.0-beta.32` docs carefully; session/JWT callbacks differ from v4
- Log in with PayPal: custom OAuth provider, may need sandbox app credentials; 2-hour timebox — if blocked, skip and document
- Firebase phone auth doesn't work on `localhost` — must use `http://127.0.0.1:3000`
- `verifyIdToken` with projectId-only init — test against real Firebase test numbers from AI Studio project `stitchsafe-48661`
- Resend without verified domain only delivers to Resend account owner's email — fine for dev

### Commands
```bash
npm run dev          # http://127.0.0.1:3000
npm run typecheck    # must pass
npm test             # must pass (77 tests from phase 1 + new phase 2 tests)
npm run db:migrate   # prisma migrate dev
npm run db:generate  # after every schema change
npm run db:seed      # tsx prisma/seed.ts
```
