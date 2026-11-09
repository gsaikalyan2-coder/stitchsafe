---
name: stitchsafe-phase
description: Run exactly one StitchSafe build phase end to end. Reads CLAUDE.md, docs/decisions.md and the latest handover, plans, implements, runs typecheck and tests, writes docs/handover_phase_N.md (Parts A/B/C), prints git commit commands, then stops and waits for the user. Use when the user says "start phase N", "run phase N", "next phase" or "write the handover".
---

# StitchSafe phase runner

Requested phase: $ARGUMENTS
If no phase number was given, use the "Current phase" line in CLAUDE.md.

Run ONE phase only. Never start the next phase in the same run.

## Phase reference

| N | Goal | Done when |
|---|---|---|
| 0 | Foundation: Next.js 16 scaffold (src/, no Cache Components), MIT license, .env.example, Prisma 7 schema + prisma.config.ts, Supabase DB + bucket, render.yaml, /api/health, git init | /api/health returns 200 locally (http://localhost:3000); migrations applied on Supabase dev |
| 1 | Domain core: pricing.ts, orderMachine.ts, versioning.ts + Vitest | every transition and total passes Vitest; no I/O in src/domain |
| 2 | Identity: Resend magic link first, Log in with PayPal (2-hour timebox), Firebase phone code, roles + short profile | two seeded users log in and show verified badges |
| 3 | Payments: PayPal token cache, create (AUTHORIZE), authorize, capture, void, reauthorize, PayPal-Request-Id, button, cron endpoint | `npm run paypal:smoke` runs authorize→capture and authorize→void with IDs stored |
| 4 | AI: checklist builder, change writer, photo checker, receipt writer; Zod + 1 retry + NEEDS_MANUAL_REVIEW | fixture contract tests pass; live calls work on 3 sample chats |
| 5 | Full flow + UI: order pages, checklist review/accept, upload, verdict, ship, fit confirmation, receipt timeline | one full order chat → released payment in sandbox locally (http://localhost:3000) |
| 6 | Winning features: add-on v2 + diff + counters + second authorization; polling chat; light trust page | each feature works locally and can be shown in the video |
| 7 | Ship: FIRST Render deploy (demo Supabase), add Render URL to PayPal return URL + Firebase authorized domains + AUTH_URL + GitHub secrets (CRON_SECRET, APP_URL), seed demo data, README, Postman collection | fresh-browser run on the Render URL passes; submission assets ready |

## Step 1: Load context (read, do not skim)

1. Read `CLAUDE.md` (hard rules, stack, layout, commands).
2. Read `docs/decisions.md`. It is the only source of business policy.
3. Read the newest `docs/handover_phase_*.md` (highest N below the requested phase). If it is missing and N > 0, stop and ask the user for it.
4. Run `git status` and `git log --oneline -5`. Report uncommitted changes before touching anything.
5. If anything in the handover contradicts `docs/decisions.md`, stop and ask. Do not pick a side.

## Step 2: Plan

1. Write a short plan: files to create or change, functions and their signatures, the tests that prove the "Done when" line, and what is out of scope.
2. Use plan mode and get the user's approval of the plan before writing code for Phases 0, 1, 5 and 6, and for any change to orderMachine, orderService or `src/server/paypal`. For other work, show the plan and continue.
3. If the phase needs something only the user can do (console settings, keys, sandbox accounts, test phone numbers), list it under "Needs from user" and stop until they confirm it is done.

## Step 3: Implement

1. Follow the hard rules in CLAUDE.md. The most important ones: AI never sets prices; integer cents; PayPal only via `src/server/paypal` with `PayPal-Request-Id`; only `orderService` moves money and only after `canTransition()`; one `OrderEvent` per state change in the same transaction.
2. Write complete, runnable code. No placeholders, no TODO stubs in money paths.
3. Add any new env var name to `.env.example` in the same change. Never write real secret values anywhere.
4. Route handlers that use Prisma, the Gemini SDK (`@google/genai`), firebase-admin or sharp declare `export const runtime = "nodejs";`.
5. Keep commits small in your head: finish one vertical slice before starting the next.

## Step 4: Verify (show evidence)

1. Run `npm run typecheck` and `npm test`. Both must pass. Paste the final lines of each output.
2. Run the phase-specific check from the table: for example `npm run paypal:smoke` (Phase 3), AI fixture tests plus one live call per prompt (Phase 4), `npm run e2e` and the hosted-URL run (Phases 5 to 7), `npm run api:test` (Phase 7).
3. If a check fails twice for the same reason, stop, explain the blocker, and ask. Do not loop.

## Step 5: Write docs/handover_phase_N.md

Use this exact structure. The file must stand alone: a new session must be able to continue from it without the chat history.

```markdown
# StitchSafe — Handover after Phase N (<phase name>)
Date: <YYYY-MM-DD> · Next phase: N+1 (<name>)

## Part A — Project summary
- Goal: AI payment agent for tailors. Agree it, hold it, check it, release it (PayPal authorize → AI photo check → capture after fit confirmation).
- Deadline: Nov 12 2026. USD sandbox. Hosting: Render free. DB/storage: Supabase.
- Status: phases 0..N done; what works end to end right now.

## Part B — This session
- Done: <bullets, each tied to a file or command>
- Decisions made (also appended to docs/decisions.md): <bullets or "none">
- Files created / modified: <list of paths>
- Tests and checks run, with results: <command → result>
- Blockers / unresolved issues: <bullets or "none">
- Needs from user before next phase: <console steps, keys, confirmations>

## Part C — Handoff for Phase N+1
- Phase goal and "Done when" (copied from the phase table)
- Start state: branch, last commit, env vars that must be set, services that must be running
- Exact first steps for the next session (read CLAUDE.md, decisions.md, this file; then …)
- Known risks and how to check them
- Commands: npm run dev | npm run typecheck | npm test | <phase-specific>
```

Then update the "Current phase" line in CLAUDE.md to: `Phase N+1 — <name> (not started)`.

## Step 6: Print git commit commands

Print them for the user to run; do not run `git push` yourself unless asked.

```bash
git status
git add -A
git commit -m "phase N: <one-line summary>" -m "<2-4 lines: what was built and how it was verified>"
git push origin main
```

For Phase 0 also print the one-time setup: `git init -b main`, `git remote add origin https://github.com/<user>/<repo>.git`, and a check that `.env` is listed in `.gitignore` before the first commit.

## Step 7: Stop

Reply tersely: phase name, done-when result (pass/fail with evidence), path of the handover file, the commit commands, and anything needed from the user. Then stop. Do not start Phase N+1 until the user confirms they have saved the handover file.
