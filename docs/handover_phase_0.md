# StitchSafe — Handover after Phase 0 (Foundation)
Date: 2026-11-09 · Next phase: 1 (Domain core)

## Part A — Project summary
- **Goal:** AI payment agent for home and boutique tailors. Agree it, hold it, check it, release it (PayPal authorize → AI photo check → capture after fit confirmation).
- **Deadline:** Nov 12 2026. USD sandbox. Hosting: Render free. DB/storage: Supabase.
- **Status:** Phase 0 done. Scaffold in place: Next.js 16.4.5 App Router, Prisma 7 schema, all pinned deps installed, `/api/health` route exists. No auth, payments, AI, or domain logic yet.

## Part B — This session

### Done
- `package.json` — all deps pinned per CLAUDE.md; added `vite@^6.0.0` (required peer for vitest 5.1.0); `allowScripts` entries added for prisma, sharp, firebase, genai, esbuild
- `tsconfig.json` — strict, `@/*` → `./src/*`, excludes `src/generated`
- `next.config.ts` — `serverExternalPackages` for pg/firebase-admin/sharp
- `postcss.config.mjs` — Tailwind 4 `@tailwindcss/postcss` plugin
- `eslint.config.mjs` — ESLint 9 flat config
- `vitest.config.ts` — node env, `@` alias, passWithNoTests
- `playwright.config.ts` — testDir `./tests/e2e`, baseURL from env
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` — minimal App Router scaffold
- `src/app/api/health/route.ts` — `GET /api/health` → `{status:"ok",ts:<ISO-8601>}`
- `src/proxy.ts` — stub (Phase 2 wires Auth.js route protection)
- `prisma/schema.prisma` — full schema: User, Account, Session, VerificationToken, Order, OrderEvent, ChecklistVersion, Payment, Message, Photo + all enums
- `prisma.config.ts` — `import 'dotenv/config'`, `migrate.url: DIRECT_URL`
- `prisma/seed.ts` — stub
- `render.yaml` — free web service, correct build cmd, all env keys
- `LICENSE` — MIT
- `.gitignore` — merged: added `src/generated/`, `.prisma/`, `*.tsbuildinfo`
- `CLAUDE.md` — updated current phase to Phase 1

### Decisions made
None new. All choices follow `docs/decisions.md` and `CLAUDE.md`.

### Files created / modified
```
package.json                    created
tsconfig.json                   created
next.config.ts                  created
postcss.config.mjs              created
eslint.config.mjs               created
vitest.config.ts                created
playwright.config.ts            created
render.yaml                     created
LICENSE                         created
prisma/schema.prisma            created
prisma.config.ts                created
prisma/seed.ts                  created
src/app/globals.css             created
src/app/layout.tsx              created
src/app/page.tsx                created
src/app/api/health/route.ts     created
src/proxy.ts                    created
.gitignore                      merged (added src/generated/, .prisma/, *.tsbuildinfo)
CLAUDE.md                       updated (current phase line)
```

### Tests and checks run
```
npm install --legacy-peer-deps  → success (peer dep warnings only, not blocking)
npm run typecheck               → exit 0, no errors
npm test                        → vitest v5.1.0, no test files, exit 0
```

### Blockers / unresolved issues
- `--legacy-peer-deps` required: `@prisma/adapter-pg@7.10.1` has transitive peer conflicts. Acceptable for hackathon.
- `npm run db:migrate` and `npm run db:generate` NOT run yet — user must do this.
- `next-env.d.ts` auto-generated on first `next dev` — not in repo yet.
- `prisma.config.ts` uses plain object export (not `defineConfig`). If `db:migrate` errors on parsing, fallback: add `directUrl = env("DIRECT_URL")` to schema datasource and clear `prisma.config.ts`.

### Needs from user before next phase
1. Run first migration against Supabase dev DB:
   ```bash
   npm run db:migrate
   # migration name: initial_schema
   npm run db:generate
   ```
2. Confirm health route locally:
   ```bash
   npm run dev
   curl http://127.0.0.1:3000/api/health
   # expected: {"status":"ok","ts":"..."}
   ```
3. Create private bucket `stitchsafe-photos` in Supabase Storage dashboard if not done.

## Part C — Handoff for Phase 1

### Phase goal
Domain core: `src/domain/pricing.ts`, `src/domain/orderMachine.ts`, `src/domain/versioning.ts` + Vitest tests.
**Done when:** every transition and total passes Vitest; no I/O in `src/domain`.

### Start state
- Branch: `main` (after git commit + push below)
- Last commit: `phase 0: foundation scaffold`
- Env vars required: `.env` with `DATABASE_URL` and `DIRECT_URL` (Supabase dev project)
- Services: Supabase dev DB — migration must be applied before Phase 1 Prisma work

### Exact first steps for Phase 1 session
1. Read `CLAUDE.md`, `docs/decisions.md`, `docs/handover_phase_0.md`
2. `git log --oneline -5` — confirm phase 0 commit present
3. `npm run typecheck && npm test` — confirm still passing
4. Create `src/domain/pricing.ts` (pure, integer cents, discount logic from decisions.md)
5. Create `src/domain/orderMachine.ts` (canTransition, all states from decisions.md)
6. Create `src/domain/versioning.ts` (checklist version bump logic)
7. Write `tests/domain/*.test.ts` alongside each file (TDD: RED → GREEN → refactor)
8. No imports from `@/server/*` or `@/generated/*` in domain files — pure functions only

### Known risks
- **`prisma.config.ts` format**: If `npm run db:migrate` fails to parse config, add `directUrl = env("DIRECT_URL")` to `prisma/schema.prisma` datasource block as fallback.
- **Prisma import path**: Phase 2+ imports from `@/generated/prisma/client` (not `@prisma/client`). Run `npm run db:generate` before writing any server code that uses Prisma.
- **`next-env.d.ts`**: Run `npm run dev` once before relying on `typecheck` for Next.js-specific types.

### Commands
```bash
npm run dev          # local dev at http://127.0.0.1:3000
npm run typecheck    # tsc --noEmit
npm test             # vitest run --passWithNoTests
npm run db:migrate   # prisma migrate dev
npm run db:generate  # prisma generate (after every schema change)
```
