# StitchSafe — Decisions (locked 2026-11-09)

| # | Topic | Decision |
|---|---|---|
| 1 | Add-on funding | Separate PayPal order + authorization for the add-on amount only. Order has many Payments. |
| 2 | Payee | Platform sandbox merchant receives funds. Tailor payout (Payouts API) = future work. |
| 3 | Photo verdict | Any PARTLY_MET or NOT_MET blocks capture. Tailor gets 2 re-upload rounds, then customer chooses accept-anyway or cancel (void). |
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
