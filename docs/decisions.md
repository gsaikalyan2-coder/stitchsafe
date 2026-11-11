# StitchSafe — Decisions (locked 2026-11-09)

| # | Topic | Decision |
|---|---|---|
| 1 | Add-on funding | Separate PayPal order + authorization for the add-on amount only. Order has many Payments. |
| 2 | Payee | Platform sandbox merchant receives funds. Tailor payout (Payouts API) = future work. |
| 3 | Photo verdict | Any PARTLY_MET or NOT_MET blocks capture. Tailor gets 2 re-upload rounds, then customer chooses accept-anyway or cancel (void). |
| 13 | Unrelated photos | An upload where every photo is flagged unrelated to the ordered garment is REJECTED. The order stays in its current state (IN_PROGRESS or CHECK_FAILED), the tailor is asked to re-upload, and it does NOT count as one of the 2 re-upload rounds. It must NOT become NEEDS_MANUAL_REVIEW and must NOT become CHECK_FAILED. It never captures, voids or changes a total. Append an OrderEvent PHOTOS_REJECTED_UNRELATED (with unrelatedReason) so the dispute evidence pack shows it. |
| 4 | Silent customer | After SHIPPED, customer has 7 days to confirm fit. If not, server auto-captures on day 25 of the authorization unless a problem is reported. |
| 5 | Cancellation | Cancel voids all live authorizations. Milestone payments = future work. |
| 6 | Report a problem | Order -> DISPUTED; blocks capture and void; shows timeline. Resolver = future work. |
| 7 | Add-ons | One add-on request per order, up to 3 counter-offers. |
| 8 | Acceptance | Both sides accept every checklist version. |
| 9 | Discount | 10% (1000 bps) on BASE lines, first order between this customer and this tailor. Server applies it; snapshot on version 1. Not applied to rush, shipping, customs or add-ons. Tailor may set 0-30%. |
| 10 | Capture timing | After delivery + customer fit confirmation. Demo orders kept short. |
| 11 | Chat | Polling every 3s. No Supabase Realtime. |
| 12 | Delivery | Hosted demo on Render, Postman collection, public GitHub repo (MIT), .env.example, video < 3 min. Deadline Nov 12 2026. |

## Holds
- Authorize at agreement. Reauthorize after the 3-day honor period via cron; authorization max 29 days.
- Sandbox authorizations do not expire; test expiry with negative testing and explain in README.

## Phase 5 decisions (Nov 10 2026)

P1 Currency: USD only, everywhere in UI. Display via formatCents. No ₹ or other currency.
P2 Price changes: the AI ("Change assistant") only drafts scope diffs (added/modified/removed items, summary_en, summary_local) via change.ts. The TAILOR types every price line (cents, via pricing.ts). Customer accepts -> add-on authorization. AI never proposes, suggests, or displays a number. No "negotiation bot" wording in UI.
P3 Checklist acceptance: both parties accept the SAME checklist version. First acceptance records acceptance on that version; the second acceptance transitions PROPOSED -> AGREED. Any edit creates a new version and clears both acceptances.
P4 Tailor dashboard stage groups (display only, derived from state): Pending payment = AGREED; In progress = AUTHORIZED, IN_PROGRESS; Under check = SUBMITTED, CHECK_FAILED, CHECK_PASSED; Delivered = SHIPPED; Released = RELEASED; Revised payment = badge (not group) on any order with a live add-on authorization; Closed = CANCELLED, VOIDED; Disputed = DISPUTED (own group, highlighted).
P5 Progress notes: tailor may post free-text progress notes (max 500 chars) on AUTHORIZED / IN_PROGRESS orders. Stored as OrderEvent type PROGRESS_NOTE. NO state change, no money, no AI. Shown on customer tracking timeline.
P6 Receipt: AI receipt.ts writes text only. All amounts, dates and times on the receipt come from server records (price lines, authorizations, captures, voids) rendered in a separate table. Never parse amounts from AI text.
P7 Roles: a user's role is per order (customerId / tailorId on Order). A user may be customer on one order and tailor on another. Dashboards: /customer shows orders where user is customer; /tailor where user is tailor. Every orderService entry point verifies the session user is the correct party for that action, server-side.
P8 Deadline: dueDate = agreedAt + deadlineDays (computed server-side at AGREED, stored). Overdue = now > dueDate and state not in {SHIPPED, RELEASED, CANCELLED, VOIDED}.

## Phase 5b decisions — P9-P12 flow changes (Nov 10 2026)

P9 Customer creates orders: customer creates order with tailor email, description, 1-5 reference photos (EXIF strip + resize via images.ts, stored as Photo with kind REFERENCE). buildChecklist uses description AND reference photos (vision model).
P10 Customer edits checklist in DRAFT: edit text, change checkMethod (photo/fit), delete, add item, "Regenerate with AI". Each save = new checklist version. "Send to tailor" appends SENT_TO_TAILOR event, stays DRAFT.
P11 Tailor proposes after SENT_TO_TAILOR: tailor sees checklist + reference photos, sets price lines, clicks Propose (DRAFT→PROPOSED). Only TAILOR can transition to PROPOSED (actor rule updated). Customer in PROPOSED: "Accept" (P3 logic) or "Request changes" (new version, clears acceptances, stays PROPOSED, CHANGES_REQUESTED event; tailor must re-check price and re-propose/accept).
P12 Reference vs finished photos: tailor photo uploader labelled "Upload finished work" (Photo kind FINISHED). verify.ts grades FINISHED photos. Both sides see Reference vs Finished work side by side with per-item AI results.

Price input UX: dollars field + -$1/+$1/+$2 stepper buttons. Clamp at $0 min. Integer cents in React state via pricing.ts.

Permissions summary:
- createOrder: customer only.
- checklist edit / regenerate / send-to-tailor: customer only, DRAFT or PROPOSED.
- price lines / propose: tailor only.
- PROPOSED → PROPOSED (request changes): customer only in PROPOSED.

Photo model: added `kind` enum (REFERENCE, FINISHED) with default FINISHED for backward compat.

## Pricing math
- Integer cents. discount = floor((baseCents * bps + 5000) / 10000)  (round half up).
- total = base + rush + shipping + customs - discount.
- PayPal breakdown: item_total=base, handling=rush, shipping=shipping, tax_total=customs, discount=discount.
- Add-on large-jump flag when addOn >= 50% of original total.

## Order states
DRAFT -> PROPOSED -> AGREED -> AUTHORIZED -> IN_PROGRESS -> SUBMITTED -> (CHECK_FAILED, max 2 rounds) -> CHECK_PASSED
-> SHIPPED -> RELEASED.   Side exits: CANCELLED/VOIDED, DISPUTED.

## Phases (to Nov 12)
0 Foundation · 1 Domain core · 2 Identity · 3 Payments · 4 AI · 5 Full flow + UI · 6 Add-ons, chat, trust page · 7 Ship

## 2026-11-09 — Firebase without a service account
- Service account key creation is blocked by Google Cloud org policy on project stitchsafe-48661.
- Decision: verify Firebase ID tokens with firebase-admin initialised with projectId only (verifyIdToken needs no credentials). Fallback: verify the JWT with `jose` against Google's securetoken JWKS (iss=https://securetoken.google.com/stitchsafe-48661, aud=stitchsafe-48661).
- FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY removed from all env files.

## 2026-11-09 — AI provider: Google Gemini (free tier) instead of Claude API
- Reason: zero-cost build. Key from Google AI Studio (also linked to Firebase project stitchsafe-48661).
- Models: GEMINI_MODEL_VISION=gemini-3.8-flash (checklist builder, photo checker); GEMINI_MODEL_FAST=gemini-3.5-flash-lite (change writer, receipt writer). If 3.8 Flash is not free-tier, use gemini-3.6-flash.
- SDK: @google/genai, generateContent with responseMimeType application/json + responseJsonSchema (z.toJSONSchema). Same Zod -> 1 retry -> NEEDS_MANUAL_REVIEW rule; AI never outputs prices.
- Free tier: Google may use inputs to improve products -> demo/sample photos only. Handle 429s gracefully.
- Reversible: all provider code in src/server/ai/client.ts; switching back to Claude = that file + env vars.
- 2026-11-09 key test: gemini-3.5-flash-lite OK; gemini-3.8-flash returned 503 (server overloaded, not a quota error). Added GEMINI_MODEL_VISION_FALLBACK=gemini-3.6-flash, used automatically on 503/429.
- 2026-11-09: GitHub repo created: https://github.com/gsaikalyan2-coder/stitchsafe (public, empty).
- 2026-11-09: Deployment deferred to Phase 7 (user decision). Phases 0-6 are verified locally on http://127.0.0.1:3000 with the dev Supabase project. Phase 7 does the first Render deploy (Singapore, demo Supabase), then sets the Render URL in PayPal return URL, Firebase authorized domains, AUTH_URL, and GitHub secrets for the cron. Until then the reauthorize/auto-capture cron is tested by calling POST /api/cron/reauthorize locally.
- 2026-11-09: Local dev URL switched from 127.0.0.1 to localhost. Diagnosis: Next.js 16 NextURL normalises 127.0.0.1 to 'localhost' in request.url (seen via a temporary debug route: host header 127.0.0.1:3000 but req.url http://localhost:3000), so Auth.js sent redirect_uri=http://localhost:3000/api/auth/callback/paypal. Fix: AUTH_URL=http://localhost:3000, PayPal Log in return URL = http://localhost:3000/api/auth/callback/paypal, run `npm run dev` without -H. Firebase authorises localhost by default.
- 2026-11-09: Fixed test data: sandbox buyer's PayPal account (ADZVTL527EUQY) had been linked to the tailor because the tailor was signed in when PayPal login ran; moved to the customer. Guard added: /login redirects signed-in users to /dashboard. Test each role in a separate browser profile/Incognito window and sign out between roles.

## 2026-11-09 — Authorization lifecycle dates (open question #37)
- Decision: tailor's delivery deadline = day 18 of the authorization. This guarantees the 7-day customer fit window ends by day 25.
- Cron auto-capture rule for a SHIPPED order: capture when (shippedAt + 7 days has passed AND authorization age >= 25 days) AND fitConfirmedAt IS NULL AND state != DISPUTED.
- Emergency capture: if authorization age reaches 28 days on a SHIPPED order before the 7-day window closes, capture anyway and log "day-28 emergency capture before authorization expiry".
- Honor period: 3 days from authorizedAt (or from reauthorizedAt after a reauthorization). Cron reauthorizes after day 3 and before day 29.
- Maximum one reauthorization per payment (reauthorizedAt tracks this).

## Decision #38 — PayPal sandbox account geography (2026-11-09)
- Original sandbox business account was IN (India). PayPal IN sellers cannot receive USD; IN-to-IN sandbox buyer transactions were also blocked.
- Switched to new sandbox app "StitchSafe US" linked to a US sandbox business account.
- Sandbox buyer for smoke tests: `sb-blw4d53813648` (US personal account).
- All PayPal env vars (`PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`) now reference the US app credentials.

## Decision #39 — Split PayPal credentials (2026-11-09)
- PayPal does not allow enabling "Log in with PayPal" (LIPP) on the new US sandbox app (dashboard save error 4d4db2051afef).
- Solution: use two separate PayPal app credentials.
  - `PAYPAL_LOGIN_CLIENT_ID` / `PAYPAL_LOGIN_CLIENT_SECRET` — old "StitchSafe" app (IN merchant). Used only by `src/server/auth/auth.ts` for OAuth sign-in. LIPP return URL: `http://localhost:3000/api/auth/callback/paypal`.
  - `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` — new "StitchSafe US" app (US merchant). Used by `src/server/paypal/**` (orders, authorize, capture, void) and `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (JS SDK button).
- The two apps never interact at runtime; each has its own token cache in `src/server/paypal/client.ts`.
