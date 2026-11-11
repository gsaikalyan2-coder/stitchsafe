# StitchSafe — Handoff File

Give this whole file to your friend. Fill in the blanks below yourself before sending it —
these are real secrets, so send the file privately (not in a public Discord/Slack channel).

====================================================================
PART 1 — FILL THESE IN FROM YOUR OWN .env FILE
====================================================================
Run this yourself first, then copy the values in:

    cd C:\Users\saika\StitchSafe-PayTm
    Get-Content .env

--------------------------------------------------------------------
GitHub repo
--------------------------------------------------------------------
Repo: https://github.com/gsaikalyan2-coder/stitchsafe (public)
Your GitHub username: ____________________
-> Add your friend as a collaborator: repo Settings -> Collaborators -> Add people

--------------------------------------------------------------------
Login to test the app (NOT real accounts — sandbox/dev only)
--------------------------------------------------------------------
Tailor login (magic link): __________________________ (your own email —
    Resend sandbox only delivers to this address, so this MUST stay your email
    unless you verify a domain in Resend)

Customer login: use "Continue with PayPal" on /login with any PayPal
    SANDBOX personal/buyer account (not magic link). Get one from:
    developer.paypal.com -> log in with: ________________________________
                             password:    ________________________________
    -> Testing Tools -> Sandbox Accounts -> copy a "Personal" account email,
       or click the 3-dot menu -> View/Edit to see its password.

    Sandbox customer email used so far: ___________________________________
    Its password:                       ___________________________________

--------------------------------------------------------------------
Database — Supabase
--------------------------------------------------------------------
Supabase project URL:      ______________________________________________
Supabase login (dashboard): email ______________________  password __________
DATABASE_URL (from .env, pooler port 6543): ____________________________________
DIRECT_URL (from .env, direct port 5432):   ____________________________________
Storage bucket name: stitchsafe-photos (private)

--------------------------------------------------------------------
PayPal Developer (sandbox)
--------------------------------------------------------------------
developer.paypal.com login: email ______________________  password __________
PAYPAL_CLIENT_ID (from .env):     ____________________________________________
PAYPAL_CLIENT_SECRET (from .env): ____________________________________________
PAYPAL_API_BASE: https://api-m.sandbox.paypal.com

--------------------------------------------------------------------
Google AI Studio (Gemini, free tier)
--------------------------------------------------------------------
GEMINI_API_KEY (from .env): ____________________________________________________
If this key hits rate limits, get a free one at https://aistudio.google.com/apikey
and swap it into .env — nothing else needs to change.

--------------------------------------------------------------------
Auth.js / other secrets from .env (copy as-is, don't need to understand them)
--------------------------------------------------------------------
AUTH_SECRET=______________________________________________________________
RESEND_API_KEY=___________________________________________________________
FIREBASE_PROJECT_ID=______________________________________________________
(copy any other lines from .env not listed above)

====================================================================
PART 2 — HOW TO RUN IT
====================================================================
    cd C:\Users\saika\StitchSafe-PayTm
    git pull
    npm install
    npm run db:generate
    npx prisma migrate deploy
    npm run dev

Open http://localhost:3000 — always use "localhost", never "127.0.0.1".

====================================================================
PART 3 — WHAT THE APP DOES (the flow, in order)
====================================================================
1. CUSTOMER creates an order: tailor's email, a description of the outfit,
   and up to 5 reference photos. AI reads this and builds a checklist.
2. CUSTOMER can edit the checklist, regenerate it with AI, or send it to
   the tailor as-is.
3. TAILOR sees the checklist + reference photos, sets the price per line
   (types it, or uses +$1/+$2 buttons), clicks Propose.
4. BOTH sides must Accept the checklist. Customer can instead click
   "Request changes" to send it back to the tailor for re-pricing.
5. Once both accept, CUSTOMER pays through PayPal — money is HELD
   (authorized), not charged yet.
6. TAILOR starts work, can post progress notes, then uploads
   FINISHED-WORK photos.
7. AI checks the finished photos against the checklist, item by item.
   - Unrelated photos -> rejected, nothing changes, doesn't count as a try.
   - Real mismatch -> up to 2 re-upload rounds, then customer chooses
     "accept anyway" or "cancel".
8. TAILOR marks it shipped. CUSTOMER confirms each checklist item fits,
   then clicks Release -> PayPal captures (charges) the held money ->
   a receipt is generated.
9. Either side can Cancel before payment, Void after payment, or
   Report a problem (freezes the money) at any point.

====================================================================
PART 4 — RULES THAT MUST NEVER BE BROKEN
====================================================================
(These are in CLAUDE.md in the repo — read that file too.)
1. AI never sets a price. Only the tailor types numbers.
2. Money is always integer cents internally (never a decimal/float).
3. PayPal is only called from src/server/paypal/** files.
4. Only src/server/services/orderService.ts changes an order's state
   or moves money — and only after checking the current state allows it.
5. Every state change writes a log entry (OrderEvent) in the same
   database transaction.
6. If the AI fails twice in a row, the order goes to
   "needs manual review" — it NEVER captures or voids money on an AI
   failure.
7. Never commit secrets. Before every git commit, run:
   git grep -n "AIza"   (must print nothing)

====================================================================
PART 5 — CURRENT STATUS / WHAT'S LEFT (deadline: Nov 12, 2026)
====================================================================
DONE: full order flow, checklist, pricing, both-side acceptance, PayPal
authorize, progress notes, price change requests, photo upload + AI
check, re-upload rounds, accept-anyway/cancel, shipping, fit
confirmation, release/capture, receipt, cancel/void/dispute, UI for
both customer and tailor dashboards.

KNOWN QUIRK: Gemini sometimes returns a "503 high demand" error. The
app handles this safely (retries once, then "needs manual review",
no money moves). If it happens during a demo recording, wait ~1 min
and click Regenerate / Retry photo check.

NOT BUILT (intentionally skipped to protect the deadline): discounts,
tailor star ratings, an earnings chart.

STILL TO DO:
1. Run the full flow once, start to finish, in two browsers
   (tailor in a normal window, customer in Incognito).
2. Deploy to Render using render.yaml (Phase 7), then run
   npm run paypal:smoke against the live URL.
3. Record the demo video. Create 2-3 test orders BEFORE recording,
   during a quiet hour, so you don't hit a Gemini 503 on camera.
4. Final check before submitting:
   npm run typecheck && npm test
   git status   (confirm everything is pushed to main)

====================================================================
PART 6 — HOW THE PROJECT WAS BUILT (for continuing it)
====================================================================
Built one phase at a time with Claude Code, using a skill already set
up in the repo: .claude/skills/stitchsafe-phase/

To do the next phase:
    /clear
    /stitchsafe-phase 6     (or 7 for deployment)

Claude Code will show its plan first — READ IT before approving.
Don't let it commit on its own; run the tests and click through the
app yourself first, same as every phase so far.
