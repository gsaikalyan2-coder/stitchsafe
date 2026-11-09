# Build StitchSafe's PayPal escrow in three days

StitchSafe is buildable by the **Nov 12 2026** deadline as one Next.js 16 app on Render: a chat order becomes a checklist both sides accept, a **PayPal authorization holds the customer's money**, Gemini checks photos of the finished outfit item by item, and the server captures only after the check passes and the customer confirms fit, or voids on cancel. The plan below keeps every decision Saikalyan made in the planning conversation (USD sandbox, 10% first-order discount, separate add-on authorization, platform merchant receives funds, 3-second polling chat, day-25 auto-capture, Nov 12 deadline) and folds in what the research found since. The research changes the plan in five places that matter. **Version pins are now mandatory**: `npm i prisma` installs the Prisma 8 release candidate and `npm i next-auth` installs v4 ([npm: prisma](https://registry.npmjs.org/prisma), [npm: next-auth](https://registry.npmjs.org/next-auth)). **Auth.js env names change** to `AUTH_URL`/`AUTH_TRUST_HOST`/`AUTH_RESEND_KEY`. **Two sign-in paths carry day-1 risk**: Resend only delivers to your own address until you verify a domain, and Log in with PayPal now sits under a `/limited-release/` docs path. **The AI layer splits across two Gemini models** (changed on 2026-11-09 from the Claude API to the free Gemini API): Gemini 3.8 Flash for the checklist builder and photo checker, Gemini 3.5 Flash-Lite for the change writer and receipt writer, with structured outputs and no price fields. **The scheduler and the free hosting tiers have hard limits** (5-minute cron floor, 15-minute spin-down, Supabase pause) that the cron job conveniently also works around. The rest of this report documents the plan end to end and ends with a ready-to-commit `CLAUDE.md` and a `stitchsafe-phase` skill.

## Tailoring runs on trust, and StitchSafe replaces trust with a held payment

### The problem and the idea from the source documents

The source set is one 4-page pitch PDF (`StitchSafe_Pitch_Script.pdf`) plus eight project docs: Problem Statement, Idea, Solution, Supporting Rules, Tech stack, Expected outcome, MVP features and Novelty ideas. They describe a market where custom tailoring runs on chat messages. **The customer pays a large advance and waits weeks** with no record of what was agreed and no protection if the outfit is wrong or never arrives. **The tailor buys and cuts fabric before knowing the customer will pay**, and made-to-measure work cannot be resold. Prices change mid-job (the docs' example is $200 becoming $500 after an add-on) with nothing written down. Overseas and first-time customers carry the most risk.

The idea is one sentence: "Stitch Safe is an AI payment agent for home and boutique tailors." The solution has four verbs, which became the tagline "Agree it, hold it, check it, release it". **Agree**: AI turns the order chat into a checklist both sides accept. **Hold**: the customer approves a PayPal payment that is authorized, not captured. **Check**: the tailor uploads photos and AI marks each checklist item met, partly met or not met. **Release or return**: capture after the check passes and the customer confirms fit; void if the order is cancelled. The docs are honest about one limit: photos show colour, style and visible details but not fit, so the customer always makes the final fit call. The governing principle, repeated across the docs, is "AI recommends and explains. Server rules control every payment."

### Who it is for

| User | What they need from StitchSafe |
|---|---|
| Home and boutique tailors | Proof that funds are secured before cutting fabric; a trust page (verified phone + PayPal badges, portfolio, reviews only from completed paid orders) that wins first-time customers |
| Customers, especially first-time and overseas | Proof of what was agreed, money held rather than sent, refund/cancellation terms shown before paying, a "Report a problem" button that keeps the money on hold |
| Human dispute reviewer (implied, not built) | A one-click evidence pack: checklist versions, photos, verdicts, event timeline. Future work |

Because **PayPal stopped domestic payments within India on 1 April 2021 and kept only cross-border sales** ([TechCrunch](https://techcrunch.com/2021/02/04/paypal-is-shutting-down-domestic-payments-business-in-india)), the pitch should frame StitchSafe as Indian tailors serving overseas and diaspora customers in USD. That is consistent with Saikalyan's choice of a generic USD sandbox and with using PayPal rather than Paytm, despite the local folder name `StitchSafe-PayTm`.

## Eighteen gaps in the documents, each closed by a recorded decision

The review of the source documents found contradictions and missing policy. Each was resolved in the planning conversation; these resolutions are user decisions and belong in `docs/decisions.md` verbatim. The research added a second batch of technical gaps, marked as plan adjustments below.

### Gaps resolved in planning (user decisions, unchanged)

| # | Gap or contradiction | Resolution |
|---|---|---|
| 1 | PayPal holds last 29 days with a 3-day honor period, but tailoring takes weeks | Authorize at agreement; server reauthorization job after the honor period; orders capped at 29 days |
| 2 | Market/currency unclear; PayPal has no India-domestic payments; folder named "PayTm" | Generic **USD sandbox**; PayPal, not Paytm |
| 3 | Docs list an "order chat" page and paste-import | **Polling every 3 s** is fine; paste-import is the standout feature |
| 4 | PDF assumes 5 days; submission is Nov 12 | About 3 build days; Tier 1 by Nov 11 noon |
| 5 | Add-ons: capture can exceed the authorization only by min(115%, +$75), so $200 → $500 cannot fit | **Separate second PayPal order + authorization for the add-on amount only** |
| 6 | Who receives money | **Single platform sandbox merchant receives funds**; tailor payout via Payouts API is future work; skip the `payee` field |
| 7 | What "partly met" means for money | Any PARTLY_MET or NOT_MET blocks capture; tailor gets 2 re-upload rounds; then customer chooses accept-anyway or cancel (void) |
| 8 | Silent customer after delivery | After SHIPPED, customer has 7 days to confirm fit; otherwise **server auto-captures on day 25 of the authorization** unless a problem was reported |
| 9 | Cancellation after fabric is cut | Void on cancel for MVP; milestone payments are future work |
| 10 | "Report a problem" | Order becomes DISPUTED, which blocks capture and void and shows the receipt timeline; resolver/admin is future work |
| 11 | "One add-on round" vs "3 counter-offers" | One add-on request per order, negotiated with up to 3 counter-offers |
| 12 | Who accepts the checklist (docs contradict) | **Both sides accept every version** |
| 13 | Discount size and scope | **10%**, first order between this customer and this tailor, applied by the server; tailor may set 0-30% |
| 14 | When to capture | After delivery + customer fit confirmation |
| 15 | SQLite locally vs Postgres hosted (Prisma allows one provider per schema) | Supabase Postgres everywhere (separate dev and demo projects) |
| 16 | CLAUDE.md referenced by the project instructions did not exist | v1 created; superseded by the version at the end of this report |
| 17 | No admin role, no privacy, rate-limit or idempotency requirements | Idempotency keys and integer cents added; privacy noted as a gap (mitigations in the AI section) |
| 18 | Hackathon rules not in the documents | Saikalyan checks the event page (Claude Cowork task, Phase 0) |

### Gaps found by research (plan adjustments)

| # | Finding | Adjustment and why |
|---|---|---|
| 19 | `prisma` `latest` is **8.0.0-rc.33** while `@prisma/client` latest is 7.10.1; Prisma calls v8 a release candidate ([npm: prisma](https://registry.npmjs.org/prisma), [Prisma v7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7?via=prisma7)) | **Pin `prisma`, `@prisma/client`, `@prisma/adapter-pg` to 7.10.1.** Mismatched majors break generation; v8 changes are unresearched |
| 20 | `next-auth` `latest` is 4.24.15; v5 exists only as **5.0.0-beta.32** ([npm: next-auth](https://registry.npmjs.org/next-auth)). Auth.js is now maintained by the Better Auth team with security patches ([Better Auth blog](https://better-auth.com/blog/authjs-joins-better-auth)) | **Pin `next-auth@5.0.0-beta.32`.** Switching to Better Auth would cost a day the schedule does not have; v5 beta still works for this scope |
| 21 | Prisma 7 moves the URL into `prisma.config.ts`, requires a driver adapter, needs a `prisma-client` generator with `output`, no longer auto-loads `.env`, and `migrate dev` no longer runs `generate` ([Prisma v7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7?via=prisma7)) | Add `prisma.config.ts` + `@prisma/adapter-pg`; **add explicit `npx prisma generate` to the Render build** |
| 22 | Next.js 16: `middleware.ts` renamed `proxy.ts` (Node only); `params`/`cookies()`/`headers()` async-only; recommended defaults enable Cache Components and no `src/` dir ([Next.js v16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16), [Installation](https://nextjs.org/docs/app/getting-started/installation)) | Use `src/proxy.ts`, `await ctx.params`; **choose "customize" in create-next-app: `src/` yes, Cache Components no**, to keep dynamic-by-default behaviour |
| 23 | Auth.js v5 env names are `AUTH_SECRET` and `AUTH_RESEND_KEY`; Resend provider is `next-auth/providers/resend` ([Auth.js env vars](https://authjs.dev/guides/environment-variables), [Auth.js email](https://authjs.dev/getting-started/authentication/email)) | **Replace `NEXTAUTH_URL` with `AUTH_URL` + `AUTH_TRUST_HOST=true`, and `RESEND_API_KEY` with `AUTH_RESEND_KEY`** (the `AUTH_URL`/`AUTH_TRUST_HOST` semantics come from prior Auth.js knowledge; the deployment page could not be fetched) |
| 24 | `resend.dev` sender **only delivers to the Resend account's own email**; others get 403 ([Resend 403](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)) | Seed one demo user with that email, sign the other role in with PayPal, or verify a domain. See Identity section |
| 25 | Render free **blocks outbound ports 25, 465, 587** ([Render free](https://render.com/docs/free)) | Use Resend's HTTPS API (the Auth.js provider does), never SMTP |
| 26 | Log in with PayPal docs live under **`/limited-release/`** ([LIPP integrate](https://developer.paypal.com/limited-release/log-in-with-paypal/integrate.md)) | **Check on day 1 that the "Log in with PayPal" checkbox appears in the sandbox app**; magic link is the fallback (2-hour timebox stays) |
| 27 | The correct scope is `https://uri.paypal.com/services/paypalattributes` (no hyphen) ([LIPP reference](https://developer.paypal.com/log-in/references.md)) | Use that exact string |
| 28 | `@paypal/react-paypal-js` 10.x ships a legacy API (`PayPalScriptProvider`, intent in script options) and a v6 API with **no client-side intent**; intent comes from the server's create-order body ([react-paypal-js README](https://unpkg.com/@paypal/react-paypal-js@10.1.2/README.md)) | Use the legacy provider with `intent: "authorize"`; server always creates `intent: "AUTHORIZE"`. Either API works because the server decides |
| 29 | `PayPal-Request-Id` keys are **stored 6 hours** ([Create Order ref](https://docs.paypal.ai/reference/api/rest/orders/create-order.md)) | Deterministic per-action keys; a retry inside 6 h returns the original result |
| 30 | Negative testing uses the `PayPal-Mock-Response` header ([PayPal negative testing](https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/)) | Test expired/voided authorizations with the header. The baseline's claim that "sandbox auths don't expire after 29 days" is **unconfirmed**, so don't rely on it either way |
| 31 | Docs conflict on whether an authorization can be reauthorized once or many times ([Reauthorize ref](https://docs.paypal.ai/reference/api/rest/authorizations/reauthorize-authorized-payment.md)) | Reauthorize **at most once per payment**; a failed reauthorization is logged and the original authorization (valid 29 days) stays in use |
| 32 | Firebase: **max 10 test numbers**, **localhost not allowed** for phone auth, new projects allow no SMS regions by default ([Firebase phone auth](https://firebase.google.cn/docs/auth/web/phone-auth?hl=en)); whether test numbers work on the free Spark plan is unconfirmed (a secondary source says phone auth needs billing since Sept 2024 ([Logto](https://blog.logto.io/firebase-authentication-pricing))) | Develop on `127.0.0.1`; add the Render domain to authorized domains; **test a fictional number on Spark on day 1** |
| 33 | GitHub Actions cron: **5-minute minimum, UTC, may be delayed or dropped**, disabled after 60 days of repo inactivity ([Cronuru guide](https://cronuru.com/guides/github-actions-scheduled-workflows), secondary) | Schedule off the hour, add `workflow_dispatch`, design jobs to be idempotent and tolerant of late runs |
| 34 | Render free **spins down after 15 min idle, ~1 min to wake**, 750 instance-hours/month ([Render free](https://render.com/docs/free)); Supabase free projects **pause after 7 days of low activity** ([Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing)) | The 10-minute cron keeps both awake through judging; warm the URL before recording |
| 35 | Claude models: Sonnet 5.5 rejects `temperature` with a 400; structured outputs are GA via `output_config.format` ([Sonnet 5.5](https://platform.claude.com/docs/en/models/sonnet-5-5/overview.md), [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs?m=1)) | ~~Two Claude models~~ **Superseded 2026-11-09**: AI provider is now Google Gemini (free tier); see the AI integration section |
| 36 | Newman "won't receive updates or fixes"; Postman recommends the Postman CLI ([Postman: Newman in CI](https://learning.postman.com/docs/reference/newman-cli/continuous-integration.md)) | Keep the collection; run it with Newman 6.2.3 (no login needed) or `postman collection run` |
| 37 | Auto-capture edge case | If an order ships after day 18 of its authorization, the 7-day fit window ends after day 25. **Open question for Saikalyan**: suggested rule is "tailor deadline must fall by day 18", which keeps both decisions intact. Log the answer in `docs/decisions.md` |

## Fourteen modules, three build tiers, one orchestrator

### Feature tiers

| Tier | Features | Done when |
|---|---|---|
| **Tier 1, must build** | Sign-in + phone page; chat → checklist; both accept; PayPal authorize; photo upload with AI verdict; capture on pass + fit confirmation; void on cancel; receipt timeline | One full order runs chat → released payment in sandbox on the hosted URL |
| **Tier 2, winning** | Chat import (paste WhatsApp/Instagram chat → checklist, deadline); reference-photo checklist; price-lock add-ons (v2 + diff + counters + 2nd authorization); light trust page (badges + portfolio); bilingual checklist (English + Tamil/Hindi from the same AI call) | Each works in the demo video |
| **Tier 3, future work only** | Voice orders, WhatsApp bot, milestone payments (30% at cutting / 70% at approval), PayPal Payouts to tailor, dispute resolver, measurement check from tape photo, late-delivery and referral discounts, reviews if time runs out | Mentioned in README and video |

The MVP list from the docs also requires role choice, short profiles, version history, one add-on round, the server-applied first-order discount, a shipping line plus tracking number, and the full order timeline on the receipt; all are covered by Tiers 1 and 2.

### Module map

| Module | Responsibility | Files | Phase |
|---|---|---|---|
| Domain: pricing | Integer-cent totals, discount, add-on jump flag, PayPal breakdown | `src/domain/pricing.ts` (built, 9 tests pass) | 1 |
| Domain: order machine | States, allowed transitions, guards (`canTransition`) | `src/domain/orderMachine.ts` | 1 |
| Domain: versioning | Checklist v1 → v2 diff, active-version rules | `src/domain/versioning.ts` | 1 |
| Identity | Auth.js (magic link, PayPal login), roles, profiles, phone verification | `src/server/auth/*`, `src/app/(auth)/*` | 2 |
| Trust page | Tailor badges (phone, PayPal), portfolio; reviews only from released orders | `src/app/tailors/[id]` | 6 |
| Order and chat | Create order, messages (3 s polling) | `api/orders`, `api/orders/[id]/messages` | 5, 6 |
| Checklist (AI) | Chat import + reference photo → bilingual items | `src/server/ai/checklist.ts` | 4 |
| Pricing (server) | Tailor enters amounts; server computes totals and discount snapshot | `orderService` + `pricing.ts` | 5 |
| Add-ons | Request, quote, ≤3 counters, accept/decline, 2nd authorization | `src/server/ai/change.ts`, `api/orders/[id]/addons` | 6 |
| Payments | Token cache, create, authorize, capture, void, reauthorize | `src/server/paypal/*` | 3 |
| Verification (AI) | Photo checker, verdict per item, rounds | `src/server/ai/verify.ts`, `images.ts` | 4, 5 |
| Release | Fit confirmation → capture all live authorizations; auto-capture | `orderService.release()`, cron route | 3, 5 |
| Fulfilment | Shipping line, tracking number, SHIPPED | `api/orders/[id]/ship` | 5 |
| Records | OrderEvent log, receipt timeline, AI receipt text; dispute pack later | `src/server/events.ts`, `src/server/ai/receipt.ts` | 5 |

The architectural rule that holds this together: **route handlers are thin** (Zod-validate the body, read the Auth.js session, call one `orderService` method, return JSON); **AI modules return data only**; **only `orderService` moves money**, and only after `canTransition()` allows the step; every transition writes an `OrderEvent` in the same Prisma transaction.

## The PayPal integration: authorize now, capture after the fit is confirmed

PayPal's authorize-and-capture flow is the escrow. The research confirms the shape the PDF assumed and adds exact fields and limits.

### Accounts and credentials

The developer dashboard provides one personal (buyer) and one business (seller) sandbox account, and more can be created under Testing Tools → Sandbox Accounts ([PayPal REST get started](https://developer.paypal.com/api/rest.md)). The **platform business sandbox account receives all funds** (decision 6). One REST app supplies `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` for both payments and Log in with PayPal. The server gets a bearer token from `POST /v1/oauth2/token` with Basic auth and `grant_type=client_credentials`; the response's `expires_in` is in seconds (the sample shows 31,668) ([PayPal REST get started](https://developer.paypal.com/api/rest.md)). `src/server/paypal/client.ts` caches it in a module variable until `expires_in − 300 s`; on Render's single long-running instance that cache is shared by all requests.

### The five calls

| Step | Call | Key details |
|---|---|---|
| Create | `POST /v2/checkout/orders` | `intent: "AUTHORIZE"`; one purchase unit; `amount` from `toPayPalAmount()`; `custom_id` = StitchSafe order ID; `reference_id` = payment ID; `invoice_id` unique per attempt or omitted (duplicates are rejected by default); `payment_source.paypal.experience_context.shipping_preference: "NO_SHIPPING"` because StitchSafe records shipping itself ([Create Order ref](https://docs.paypal.ai/reference/api/rest/orders/create-order.md)) |
| Authorize | `POST /v2/checkout/orders/{id}/authorize`, body `{}` | Read `purchase_units[0].payments.authorizations[0].id` and `expiration_time`; send `Prefer: return=representation` ([PayPal authorization guide](https://developer.paypal.com/docs/checkout/standard/customize/authorization/), [Multiparty auth-capture](https://developer.paypal.com/docs/multiparty/checkout/standard/customize/auth-capture/)) |
| Capture | `POST /v2/payments/authorizations/{auth_id}/capture` → 201 | Use the latest (reauthorized) ID; returns a capture ID needed for refunds; send `final_capture: true` (field behaviour from background knowledge, unverified) |
| Void | `POST /v2/payments/authorizations/{auth_id}/void` | Releases the hold; no further captures |
| Reauthorize | `POST /v2/payments/authorizations/{auth_id}/reauthorize` | Only after the 3-day honor period and within 29 days; returns a **new authorization ID** and a new 3-day honor period ([Reauthorize ref](https://docs.paypal.ai/reference/api/rest/authorizations/reauthorize-authorized-payment.md)) |

The breakdown rule is strict: when `amount.breakdown` is present, **`value` must equal item_total + tax_total + shipping + handling + insurance − shipping_discount − discount** ([Create Order ref](https://docs.paypal.ai/reference/api/rest/orders/create-order.md)). `toPayPalAmount()` maps BASE → `item_total`, RUSH → `handling`, SHIPPING → `shipping`, CUSTOMS → `tax_total`, discount → `discount`, which satisfies the rule by construction. StitchSafe sends no `items[]`, so the item-sum rule does not apply.

### Holding money for weeks

An authorization **holds funds for 29 days; PayPal recommends capturing within the 3-day honor period**, and capture success after that is subject to funds availability ([PayPal authorization and honor period](https://developer.paypal.com/docs/checkout/standard/customize/authorization-honor/)). A reauthorization restarts the honor period, but "if you reauthorize on the 27th day ... you get only 2 days" ([PayPal authorization guide](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)). The plan keeps the agreed design (authorize at agreement, reauthorization job after the honor period, orders capped at 29 days) and adds one technical refinement: because the docs conflict on whether repeat reauthorizations are allowed, the cron job **reauthorizes a payment once**, preferably when its order reaches SHIPPED so the fresh honor period lands nearest to capture, and treats a reauthorization failure as non-fatal. Authorization statuses to store are `CREATED`, `CAPTURED`, `DENIED`, `PARTIALLY_CAPTURED`, `VOIDED` and `PENDING` ([Reauthorize ref](https://docs.paypal.ai/reference/api/rest/authorizations/reauthorize-authorized-payment.md)).

### Add-ons get their own authorization

Capture can exceed the authorized amount by **at most 115% or +$75 USD, whichever is less** ([PayPal authorization and honor period](https://developer.paypal.com/docs/checkout/standard/customize/authorization-honor/)), so a $200 order cannot absorb a $300 embroidery add-on. As decided, the add-on becomes a **second PayPal order with `intent: "AUTHORIZE"` for the add-on amount only**, built with `toPayPalAddOnAmount()`. Checklist v2 becomes active only when both sides accept and that second authorization succeeds. At release, `orderService` captures every live authorization; on cancel it voids every live authorization. The add-on authorization starts its own 29-day clock.

### Idempotency, buttons and negative tests

Every POST carries `PayPal-Request-Id` (max 108 chars; PayPal stores keys for **6 hours**) ([Create Order ref](https://docs.paypal.ai/reference/api/rest/orders/create-order.md)). Keys are deterministic per action, for example `create-<paymentId>`, `authorize-<paymentId>`, `capture-<authorizationId>`, `void-<authorizationId>`, `reauth-<authorizationId>`, so a double click returns the original result instead of capturing twice.

On the client, `@paypal/react-paypal-js` 10.1.2 offers two APIs ([react-paypal-js README](https://unpkg.com/@paypal/react-paypal-js@10.1.2/README.md)). StitchSafe uses the **legacy `PayPalScriptProvider` with `options={{ clientId, intent: "authorize", currency: "USD" }}`**, because PayPal's own authorization guide documents that path and notes that "the default intent captures immediately" ([PayPal authorization guide](https://developer.paypal.com/docs/checkout/standard/customize/authorization/)). `createOrder` POSTs `/api/orders/[id]/payment` and returns the PayPal order ID; `onApprove` POSTs `/api/orders/[id]/payment/authorize`, never capture. The v6 API (`PayPalProvider`, `PayPalOneTimePaymentButton` from `@paypal/react-paypal-js/sdk-v6`) is an acceptable alternative: it has no client-side intent, `createOrder` returns `{ orderId }`, and the server's `intent: "AUTHORIZE"` decides. Button copy should say "Hold payment", not "Pay".

Failure demos use the sandbox header `PayPal-Mock-Response: {"mock_application_codes":"<CODE>"}` ([PayPal negative testing](https://developer.paypal.com/tools/sandbox/negative-testing/request-headers/)). Candidate codes such as `AUTHORIZATION_EXPIRED`, `AUTHORIZATION_VOIDED` and `INSTRUMENT_DECLINED` are unverified, and community threads report the header sometimes returning 403 ([PayPal Community](https://www.paypal-community.com/t5/Sandbox-Environment/PayPal-Mock-Response-header-not-working-got-403-error-instead/td-p/3184342)), so treat negative tests as nice-to-have. Webhooks are optional for the demo; synchronous responses are enough.

### Log in with PayPal

The sandbox endpoints are `https://www.sandbox.paypal.com/connect` (authorize), `https://api-m.sandbox.paypal.com/v1/oauth2/token` (token, Basic client auth) and `https://api-m.sandbox.paypal.com/v1/identity/oauth2/userinfo` (userinfo); the authorize URL needs `flowEntry=static` and a `redirect_uri` that exactly matches the dashboard Return URL ([LIPP integrate](https://developer.paypal.com/limited-release/log-in-with-paypal/integrate.md)). Scopes are `openid profile email https://uri.paypal.com/services/paypalattributes`, where the last returns account verification status and payer ID ([LIPP reference](https://developer.paypal.com/log-in/references.md)). The baseline planned an Auth.js "custom OIDC provider"; the research found **no published discovery/issuer URL**, so the provider is configured as **`type: "oauth"` with explicit `authorization`, `token` and `userinfo` URLs**, `client: { token_endpoint_auth_method: "client_secret_basic" }`, and a `profile()` that maps `user_id`/`payer_id`, `email` (or `emails[]`) and `name`. This is a design from background knowledge; verify it in the 2-hour timebox. The Return URL is `${AUTH_URL}/api/auth/callback/paypal`.

## AI integration (Google Gemini, free tier): four calls, two models, no prices

> **Changed 2026-11-09:** the AI provider moved from the Claude API to **Google Gemini via an AI Studio key (free tier)**, to keep the build at zero cost. All provider-specific code sits in `src/server/ai/client.ts`, so switching back to Claude later means changing that one file and the env vars; prompts, Zod schemas and the safety rules stay the same.

### Which model does what

| Call | Model | Input | Output (Zod) | Why |
|---|---|---|---|---|
| Checklist builder | `gemini-3.8-flash` | Pasted chat (English/Tamil/Hindi, code-mixed) + optional reference photo + today's date | Items `{label_en, label_local, local_lang, source_quote}`, `priceLineSuggestions[{lineType, label, reason}]`, `deadlineText`, `ambiguities[]` | Mixed-script extraction plus an image; errors propagate to every later step |
| Change writer | `gemini-3.5-flash-lite` | Active checklist JSON + add-on request text | Added/modified/removed items with reasons + plain-language summary | Structured text transform; server computes the diff and jump flag |
| Photo checker | `gemini-3.8-flash` | 1-4 outfit photos (labelled) + checklist | Per item `{itemId, verdict: MET/PARTLY_MET/NOT_MET, evidence, imageRefs[], feedbackForTailor}` + notes | This decision gates money; vision accuracy matters most |
| Receipt writer | `gemini-3.5-flash-lite` | Server-decided outcome + OrderEvent timeline | English + customer-language explanation, ≤120 words | Explains facts already decided |

Google's model list tells new projects to use **3.5 Flash-Lite or 3.8 Flash**, and notes that `gemini-3.5-flash` is deprecated and auto-routed to `gemini-3.6-flash` ([Gemini models](https://ai.google.dev/gemini-api/docs/models), [Release notes](https://ai.google.dev/gemini-api/docs/changelog)). **Day-1 check in AI Studio:** confirm both models show a free tier for your key; if `gemini-3.8-flash` is not free, set `GEMINI_MODEL_VISION=gemini-3.6-flash`. Google no longer publishes fixed free-tier RPM/RPD figures; the active limits for your project are shown in AI Studio, so the UI must handle a 429 with a friendly "try again in a minute" and the server must not retry in a tight loop.

### Structured JSON output

Use `@google/genai` (`new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })`) and `ai.models.generateContent({ model, contents, config: { responseMimeType: "application/json", responseJsonSchema } })`, where `responseJsonSchema` comes from `z.toJSONSchema(Schema)` (Zod 4). Then `Schema.parse(JSON.parse(response.text))`. The agreed "JSON → Zod → 1 retry → NEEDS_MANUAL_REVIEW" pattern stays: on a blocked prompt, a SAFETY or MAX_TOKENS finish, a JSON/Zod error, or a failed business check (every checklist `itemId` appears exactly once, no unknown IDs, enum case normalised), retry once; on a second failure, record the run as `NEEDS_MANUAL_REVIEW` and never move money automatically. Google labels `generateContent` the legacy surface next to its newer Interactions API; either works for this build, and `generateContent` is the simpler choice. **Verify the exact config field names against the current ai.google.dev docs at the start of Phase 4** (they were not tested from this environment).

**AI schemas contain no price amounts.** The checklist builder may suggest a line type (BASE, RUSH, SHIPPING, CUSTOMS) and show the `source_quote` where the chat mentioned a price, but the tailor types each amount in the review form and `computeOrderTotals()` produces the total. The change writer proposes items; the tailor quotes the add-on amount; `computeAddOnTotals()` raises the large-jump flag at ≥50% of the original total.

### Images: download, strip, resize, then base64

`src/server/ai/images.ts` downloads each photo with the service-role Supabase client, runs `sharp` to auto-rotate, drop EXIF/GPS, convert to JPEG and resize to a 1568 px long edge, then sends it as an `inlineData` part (`mimeType: "image/jpeg"`, base64). Keep each request's inline data small (1-4 resized photos). Prompts put **images first, each labelled "Image 1:", "Image 2:"**, then the checklist and rubric. The photo-checker rubric: MET only when clearly visible and matching; PARTLY_MET when ambiguous, partly visible or slightly off; NOT_MET when absent or contradicted; never MET by default; measurements are visual approximations ("confirm by tape"); judge the garment, never the person or fit on a body. Route handlers that use the Gemini SDK, `sharp` or `firebase-admin` declare `export const runtime = "nodejs"`.

**Privacy on the free tier:** content sent on the free tier can be used to improve Google's products, so the demo uses **sample/demo photos only**, never real customers' photos. Moving to a paid Gemini tier (or back to Claude) changes this. StitchSafe adds its own mitigations: private bucket, EXIF stripped server-side, a consent line before upload, UI guidance to photograph garments flat, on a hanger or on a mannequin, and safety blocks routed to manual review.

## Stack and environment: pinned versions and the full .env specification

### Frontend, backend and services

| Layer | Choice | Version (npm, 2026-11-09) |
|---|---|---|
| App framework | Next.js App Router, TypeScript strict, React 19.2 | `next` **16.4.5** ([npm](https://registry.npmjs.org/next)) |
| Styling | Tailwind CSS v4 (CSS-first config) | `tailwindcss` **4.3.5** ([npm](https://registry.npmjs.org/tailwindcss)) |
| Backend API | Next.js route handlers in `src/app/api/**` | same app |
| ORM | Prisma 7 with `pg` driver adapter | `prisma`, `@prisma/client`, `@prisma/adapter-pg` **7.10.1** ([npm](https://registry.npmjs.org/@prisma/client)) |
| Database | Supabase Postgres (dev + demo projects) | pooled 6543 runtime, direct 5432 CLI ([Prisma Postgres v7](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)) |
| Files | Supabase Storage private bucket, signed upload (valid 2 h) and read URLs, 5 MB, jpg/png/webp | `@supabase/supabase-js` **2.119.0** ([Supabase signed upload](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl)) |
| Auth | Auth.js v5 + Prisma adapter; Resend magic link; PayPal OAuth provider | `next-auth` **5.0.0-beta.32**, `@auth/prisma-adapter` **2.11.3**, `resend` **6.37.0** |
| Phone OTP | Firebase phone auth (test numbers) + server verify | `firebase` **13.2.0**, `firebase-admin` **14.5.0** |
| AI | Google Gemini SDK, Zod 4, sharp | `@google/genai`: run `npm view @google/genai version` and pin; models `gemini-3.8-flash` and `gemini-3.5-flash-lite` ([Gemini models](https://ai.google.dev/gemini-api/docs/models)) |
| Payments | PayPal REST via `fetch`; buttons | `@paypal/react-paypal-js` **10.1.2** |
| Chat | SWR polling every 3 s | pin at install |
| Scheduler | GitHub Actions cron → `/api/cron/reauthorize` | n/a |
| Tests | Vitest, Playwright, Postman collection | `vitest` **5.1.0**, `@playwright/test` **1.65.0**, `newman` **6.2.3** or Postman CLI |
| Hosting | Render free web service, `render.yaml` | Node ≥ 20.19 (Prisma 7 minimum) via `engines.node` |

Scaffold with `npx create-next-app@16.4.5 stitchsafe` and answer **customize**: TypeScript yes, ESLint yes, Tailwind yes, `src/` directory yes, App Router yes, Turbopack yes, Cache Components **no**, import alias `@/*`. Then install with exact pins: `npm i next-auth@5.0.0-beta.32 @auth/prisma-adapter@2.11.3 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 resend@6.37.0 @supabase/supabase-js@2.119.0 firebase@13.2.0 firebase-admin@14.5.0 @paypal/react-paypal-js@10.1.2 @google/genai zod@4 sharp swr dotenv` and `npm i -D prisma@7.10.1 vitest@5.1.0 @playwright/test@1.65.0 newman@6.2.3 tsx`, then replace the caret ranges for the unversioned packages with the exact installed versions.

### Prisma 7 on Supabase and Render

Prisma 7 requires a driver adapter, an ESM `prisma-client` generator with an `output` path, and a `prisma.config.ts` that holds the CLI URL; `.env` is no longer loaded automatically ([Prisma v7 upgrade guide](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7?via=prisma7)). The config is three lines plus a `dotenv` import:

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({ schema: "prisma/schema.prisma", datasource: { url: env("DIRECT_URL") } });
```

The runtime client in `src/server/db.ts` is `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })` held on `globalThis` in development ([Prisma Postgres v7](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)). Whether `?pgbouncer=true` still matters with the `pg` adapter is unconfirmed; keep it as Prisma's example does. Because `migrate dev` no longer runs `generate`, **the Render build command is `npm ci && npx prisma generate && npx prisma migrate deploy && npm run build`**. Render inlines `NEXT_PUBLIC_*` at build time, so those variables must be set before the first build.

```yaml
# render.yaml
services:
  - type: web
    name: stitchsafe
    runtime: node
    plan: free
    region: singapore
    buildCommand: npm ci && npx prisma generate && npx prisma migrate deploy && npm run build
    startCommand: npm start
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: AUTH_SECRET
        generateValue: true
      - key: AUTH_TRUST_HOST
        value: "true"
      - key: AUTH_URL
        sync: false
      - key: CRON_SECRET
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: DIRECT_URL
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: SUPABASE_BUCKET
        value: stitchsafe-photos
      - key: NEXT_PUBLIC_SUPABASE_URL
        sync: false
      - key: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
        sync: false
      - key: PAYPAL_CLIENT_ID
        sync: false
      - key: PAYPAL_CLIENT_SECRET
        sync: false
      - key: PAYPAL_API_BASE
        value: https://api-m.sandbox.paypal.com
      - key: PAYPAL_WEB_BASE
        value: https://www.sandbox.paypal.com
      - key: NEXT_PUBLIC_PAYPAL_CLIENT_ID
        sync: false
      - key: AUTH_RESEND_KEY
        sync: false
      - key: EMAIL_FROM
        sync: false
      - key: SEED_TAILOR_EMAIL
        sync: false
      - key: SEED_CUSTOMER_EMAIL
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_API_KEY
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
        sync: false
      - key: NEXT_PUBLIC_FIREBASE_PROJECT_ID
        sync: false
      - key: FIREBASE_PROJECT_ID
        sync: false
      - key: GEMINI_API_KEY
        sync: false
      - key: GEMINI_MODEL_VISION
        value: gemini-3.8-flash
      - key: GEMINI_MODEL_FAST
        value: gemini-3.5-flash-lite
```

`sync: false` prompts for the value only when the Blueprint is first created, and `generateValue: true` creates a random secret ([Render Blueprint reference](https://render-web.onrender.com/docs/yaml-spec)). The `region` value is a choice, not a requirement; pick whichever Render region is closest to the Supabase project.

### .env.example (full specification)

Changes from the agreed baseline are marked `CHANGED` or `NEW` in comments.

```bash
# ======================================================================
# StitchSafe .env.example: copy to .env and fill in. Never commit .env.
# ======================================================================

# ---------- App / Auth.js v5 ----------
# CHANGED: AUTH_URL replaces NEXTAUTH_URL (Auth.js v5 naming).
# Local: http://127.0.0.1:3000 (not localhost: Firebase phone auth rejects localhost)
# Render: https://<service-name>.onrender.com
AUTH_URL=http://127.0.0.1:3000
# NEW: required behind Render's proxy so Auth.js trusts the forwarded host.
AUTH_TRUST_HOST=true
# Generate with: npx auth secret   (or: openssl rand -base64 32)
AUTH_SECRET=
# Shared secret for GitHub Actions -> POST /api/cron/reauthorize
# (sent as "Authorization: Bearer <CRON_SECRET>"). Generate: openssl rand -hex 32
CRON_SECRET=

# ---------- Database: Supabase Postgres (Prisma 7.10.1) ----------
# Runtime (transaction pooler, port 6543), used by the PrismaPg adapter:
# postgres://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?pgbouncer=true
DATABASE_URL=
# CLI + migrations (direct, port 5432), read in prisma.config.ts:
# postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
DIRECT_URL=

# ---------- Supabase Storage (private bucket) ----------
SUPABASE_URL=
# Server only. Never expose to the browser.
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=stitchsafe-photos
# NEW: browser client for uploadToSignedUrl(path, token, file). No bucket policies
# are needed: the signed upload token authorizes the single upload.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# ---------- PayPal sandbox (payments + Log in with PayPal, same REST app) ----------
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_API_BASE=https://api-m.sandbox.paypal.com
# NEW: web host for the Log in with PayPal authorize endpoint (<base>/connect).
PAYPAL_WEB_BASE=https://www.sandbox.paypal.com
# Same value as PAYPAL_CLIENT_ID; read by the PayPal JS SDK in the browser.
NEXT_PUBLIC_PAYPAL_CLIENT_ID=

# ---------- Email magic link (Resend via Auth.js) ----------
# CHANGED: AUTH_RESEND_KEY replaces RESEND_API_KEY (auto-read by the Auth.js Resend provider).
AUTH_RESEND_KEY=
# Without a verified domain use onboarding@resend.dev; it only delivers to the
# email address that owns the Resend account.
EMAIL_FROM=onboarding@resend.dev
# NEW: seeded demo users. Set at least one to the Resend account owner's email.
SEED_TAILOR_EMAIL=
SEED_CUSTOMER_EMAIL=

# ---------- Firebase phone auth (test numbers only) ----------
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
# Service account for firebase-admin verifyIdToken (server only).
FIREBASE_PROJECT_ID=

# ---------- AI (Google Gemini via AI Studio, free tier) ----------
# CHANGED 2026-11-09: Gemini replaces the Claude API. Key from aistudio.google.com.
# Free tier: Google may use inputs to improve its products -> demo/sample photos only.
GEMINI_API_KEY=
# Checklist builder + photo checker (vision):
GEMINI_MODEL_VISION=gemini-3.8-flash
# Change writer + receipt writer (fast):
GEMINI_MODEL_FAST=gemini-3.5-flash-lite
```

Two values live outside `.env`: the GitHub repository secrets `APP_URL` (the Render URL) and `CRON_SECRET` (same value as above), used by the cron workflow.

## Data model and order state machine

### Entities

| Entity | Key fields | Relations |
|---|---|---|
| User, Account, Session, VerificationToken | Auth.js standard models (magic-link tokens need the DB) ([Auth.js email](https://authjs.dev/getting-started/authentication/email)) | User 1-1 Profile |
| Profile | role (TAILOR/CUSTOMER), displayName, phone, phoneVerifiedAt, paypalVerifiedAt, paypalPayerId, languages[], discountBps (tailor, default 1000, 0-3000) | |
| PortfolioItem | tailorId, photoPath, caption | Tailor 1-N |
| Review | orderId (unique, must be RELEASED), rating, text | Tailor 1-N |
| Order | customerId, tailorId, status, deadline, verificationRound, firstOrderEligible, shippedAt, fitConfirmedAt, createdAt | N-1 customer, N-1 tailor |
| ChecklistVersion | orderId, version, isActive, acceptedByTailorAt, acceptedByCustomerAt, discountBps snapshot, totals snapshot (cents) | Order 1-N |
| ChecklistItem | versionId, labelEn, labelLocal, localLang, sourceQuote | Version 1-N |
| PriceLine | versionId, kind (BASE/RUSH/SHIPPING/CUSTOMS/ADDON), label, amountCents | Version 1-N |
| AddOnRequest | orderId, requestText, quotedCents, status (REQUESTED/QUOTED/COUNTERED/ACCEPTED/FUNDED/DECLINED), isLargeJump | Order 1-N (one per order in MVP) |
| CounterOffer | addOnId, byRole, amountCents, note | AddOn 1-N (≤3) |
| Payment | orderId, kind (ORIGINAL/ADDON), paypalOrderId, authorizationId (current), authorizationHistory (JSON of prior IDs), amountCents, status, honorUntil, expiresAt, reauthorizedAt, captureId, capturedAt, voidedAt | Order 1-N |
| PhotoUpload | orderId, round, path, mimeType, sizeBytes | Order 1-N |
| VerificationRun | orderId, round, status (PASSED/FAILED/NEEDS_MANUAL_REVIEW), model, rawJson | Order 1-N |
| ItemVerdict | runId, checklistItemId, verdict, evidence, imageRefs, feedback | Run 1-N |
| FitConfirmation, Shipment | confirmedAt / carrier, trackingNumber, shippedAt | Order 1-1 each |
| Message | orderId, senderId, body, createdAt | Order 1-N |
| OrderEvent | orderId, type, fromStatus, toStatus, actorId, payload JSON, createdAt (append-only) | Order 1-N |
| ProblemReport | orderId, reporterId, reason, createdAt | Order 0-N |

### State machine

```
Main path
  DRAFT ─► PROPOSED ─► AGREED ─► AUTHORIZED ─► IN_PROGRESS ─► SUBMITTED ─┬─► CHECK_PASSED ─► SHIPPED ─► RELEASED
          (v1 proposed) (both    (PayPal       (tailor        (photos +  │   (every item     (tracking  (fit confirmed,
                         accept)  authorize)    starts)        verify)   │    MET)            number)    or day-25 auto-capture)
                                                                         │
                                                                         └─► CHECK_FAILED ─(re-upload, max 2 rounds)─► SUBMITTED
                                                                                  │
                                                                                  └─(after the 2nd re-upload fails) customer chooses:
                                                                                       accept-anyway ─► CHECK_PASSED   or   cancel ─► VOIDED
Side exits
  DRAFT | PROPOSED | AGREED      ── cancel ──────────► CANCELLED   (nothing to void)
  AUTHORIZED ... CHECK_PASSED    ── cancel ──────────► VOIDED      (void every live authorization)
  AUTHORIZED ... SHIPPED         ── report problem ──► DISPUTED    (blocks capture and void)
```

| From | To | Trigger | Guard (in `canTransition`) | Money side-effect |
|---|---|---|---|---|
| DRAFT | PROPOSED | Checklist v1 proposed (import or manual) | Has ≥1 item and ≥1 BASE line | none |
| PROPOSED | AGREED | Second acceptance | Both `acceptedBy*At` set on active version | none |
| AGREED | AUTHORIZED | `payment/authorize` succeeds | Payment status CREATED | **authorize** |
| AUTHORIZED | IN_PROGRESS | Tailor starts work | Role = tailor | none |
| IN_PROGRESS / CHECK_FAILED | SUBMITTED | Photos uploaded + verify | round ≤ 2 re-uploads | none |
| SUBMITTED | CHECK_PASSED / CHECK_FAILED | VerificationRun result | PASSED only if every item MET | none |
| CHECK_FAILED (final round) | CHECK_PASSED | Customer accept-anyway | Role = customer | none |
| CHECK_PASSED | SHIPPED | Tracking number saved | Role = tailor | (reauthorize once if past honor period) |
| SHIPPED | RELEASED | Fit confirmed, or auto-capture rule | No open ProblemReport | **capture all live authorizations** |
| DRAFT/PROPOSED/AGREED | CANCELLED | Cancel | none authorized | none |
| AUTHORIZED … CHECK_PASSED | VOIDED | Cancel | Not DISPUTED | **void all live authorizations** |
| AUTHORIZED … SHIPPED | DISPUTED | Report a problem | none | blocks capture and void |

A VerificationRun that ends in NEEDS_MANUAL_REVIEW leaves the order in SUBMITTED and shows the photos to the customer, who can choose the same accept-anyway or cancel options; this is a proposed handling and should be logged in `docs/decisions.md`. Cancel after SHIPPED is not allowed in the MVP; the customer uses "Report a problem" instead (also log it).

### Pricing engine summary

`src/domain/pricing.ts` is already written and tested (9 Vitest tests, strict `tsc` clean; full code in the appendix). All amounts are **integer cents**. The discount is `floor((base × bps + 5000) / 10000)`, round half up, applied **to BASE lines only** (not rush, shipping, customs or add-ons), default 1000 bps (10%), tailor-settable 0-3000 bps, and applied only when `eligible` is true; eligibility (the customer's first order with this tailor) is a DB check in `orderService`, snapshotted on version 1. `total = base + rush + shipping + customs − discount`. Add-ons are computed separately by `computeAddOnTotals()`, with `isLargeJump` when the add-on is ≥5000 bps (50%) of the original total. `toPayPalAmount()` maps to PayPal's breakdown (item_total, handling, shipping, tax_total, discount). The reference example: $180 base + $20 rush + $25 shipping + $10 customs − $18 discount = **$217.00**.

## How every module connects: request flows

```
 Browser (Next.js pages, SWR polling 3s)
   │   PayPal JS SDK buttons (approve)      Firebase JS SDK (phone code -> ID token)
   ▼
 src/app/api/**  route handlers  ──  Zod validate ─ auth() session ─ one orderService call ─ JSON
   │
   ▼
 src/server/services/orderService.ts   (the ONLY orchestrator; runs inside prisma.$transaction)
   ├── src/domain/orderMachine.canTransition()   pure guard
   ├── src/domain/pricing.computeOrderTotals()   pure money math
   ├── src/domain/versioning.diff()              pure checklist diff
   ├── src/server/ai/*        checklist | change | verify | receipt   (returns data only)
   │       └── images.ts: Supabase download -> sharp -> base64 -> Gemini API
   ├── src/server/paypal/*    token cache, create, authorize, capture, void, reauthorize (+PayPal-Request-Id)
   ├── src/server/storage/*   signed upload/read URLs (Supabase Storage, private bucket)
   ├── src/server/auth/*      Auth.js session, firebase-admin verifyIdToken
   ├── Prisma (Supabase Postgres via PrismaPg)
   └── src/server/events.appendOrderEvent()     same transaction as every state change

 GitHub Actions cron (every 10 min, UTC) ── POST /api/cron/reauthorize (Bearer CRON_SECRET)
   └── orderService.reauthorizeDue() + orderService.autoCaptureDue()
```

### API routes

| Route | Method | orderService call | Transition |
|---|---|---|---|
| `/api/health` | GET | none (DB ping) | none |
| `/api/orders` | POST, GET | `createOrder`, `listOrders` | → DRAFT |
| `/api/orders/[id]` | GET | `getOrder` | none |
| `/api/orders/[id]/import-chat` | POST | `importChat` | DRAFT → PROPOSED |
| `/api/orders/[id]/versions` | POST | `proposeVersion` | stays / → PROPOSED |
| `/api/orders/[id]/versions/[v]/accept` | POST | `acceptVersion` | PROPOSED → AGREED |
| `/api/orders/[id]/addons` | POST | `requestAddOn` | none |
| `/api/orders/[id]/addons/[a]/counter`, `accept`, `decline` | POST | `counterAddOn`, `acceptAddOn`, `declineAddOn` | none |
| `/api/orders/[id]/payment` | POST | `createPayPalOrder` (original or add-on) | none |
| `/api/orders/[id]/payment/authorize` | POST | `authorizePayment` | AGREED → AUTHORIZED (or activates v2) |
| `/api/orders/[id]/photos` | POST | `createUploadUrl` | none |
| `/api/orders/[id]/photos/verify` | POST | `verifyPhotos` | → SUBMITTED → CHECK_PASSED/FAILED |
| `/api/orders/[id]/ship` | POST | `markShipped` | CHECK_PASSED → SHIPPED |
| `/api/orders/[id]/fit` | POST | `confirmFitAndRelease` | SHIPPED → RELEASED |
| `/api/orders/[id]/cancel` | POST | `cancelOrder` | → CANCELLED / VOIDED |
| `/api/orders/[id]/report` | POST | `reportProblem` | → DISPUTED |
| `/api/orders/[id]/messages` | GET, POST | `listMessages`, `postMessage` | none |
| `/api/orders/[id]/receipt` | GET | `getReceipt` | none |
| `/api/me/phone` | POST | `verifyPhone` | none |
| `/api/cron/reauthorize` | POST | `reauthorizeDue`, `autoCaptureDue` | SHIPPED → RELEASED (auto) |

Dynamic route handlers in Next 16 read params asynchronously: `export async function POST(req: Request, ctx: RouteContext<'/api/orders/[id]'>) { const { id } = await ctx.params; }` ([Next.js v16 upgrade](https://nextjs.org/docs/app/guides/upgrading/version-16)).

### Per-flow steps

**Sign-in.** The user signs in through Auth.js with Log in with PayPal (sets `paypalVerifiedAt` and `paypalPayerId` from the `paypalattributes` scope) or a Resend magic link. On the phone page, the Firebase SDK runs an invisible `RecaptchaVerifier`, `signInWithPhoneNumber`, then `confirmationResult.confirm(code)` ([Firebase phone auth](https://firebase.google.cn/docs/auth/web/phone-auth?hl=en)); the client POSTs the Firebase ID token to `/api/me/phone`, where `firebase-admin` `verifyIdToken` checks it ([Firebase verify ID tokens](https://firebase.google.com/docs/auth/server/verify-id-tokens)) and `phoneVerifiedAt` is set. `src/proxy.ts` sends unauthenticated users to sign-in.

**Chat → checklist.** The customer or tailor pastes a chat (and optionally attaches a reference photo via a signed upload). `import-chat` → `orderService.importChat` → `ai.buildChecklist` (Gemini 3.8 Flash) → Zod + business checks → ChecklistVersion v1 with bilingual items and empty price lines → status PROPOSED → OrderEvent. On NEEDS_MANUAL_REVIEW, the order stays DRAFT and the tailor enters items by hand.

**Agree.** The tailor enters amounts per price line; `computeOrderTotals` produces totals with the discount snapshot; each side accepts the active version; the second acceptance moves PROPOSED → AGREED. Any edit creates a new version and clears both acceptances.

**Hold.** The PayPal button's `createOrder` → `payment` route → `paypal.createOrder(intent AUTHORIZE, toPayPalAmount(totals))` → returns the PayPal order ID; the buyer approves in the PayPal popup; `onApprove` → `payment/authorize` → `paypal.authorizeOrder` → store `authorizationId`, `expiresAt`, `honorUntil = authorizedAt + 3 days` → AUTHORIZED → OrderEvent. Every page then shows "Money held, not sent".

**Reauthorize.** The cron route finds payments with live authorizations past `honorUntil`, not yet reauthorized, under 29 days old (preferring orders in SHIPPED) → `paypal.reauthorize` → new ID stored, old ID appended to history → OrderEvent.

**Add-on.** The customer requests an add-on in words → `ai.writeChange` (Gemini 3.5 Flash-Lite) proposes item changes → tailor quotes the add-on amount → `computeAddOnTotals` sets `isLargeJump` → up to 3 counter-offers → both accept → second PayPal order + authorization for the add-on amount only → v2 becomes active → OrderEvent. Decline leaves v1 active.

**Check.** The tailor gets signed upload URLs (5 MB, jpg/png/webp) and uploads 1-4 photos → `photos/verify` → `images.ts` prepares base64 → `ai.verifyPhotos` (Gemini 3.8 Flash) → ItemVerdicts → all MET = CHECK_PASSED, else CHECK_FAILED with polite per-item feedback; round +1; after the second re-upload round fails, the customer chooses accept-anyway or cancel.

**Release.** The tailor saves the shipping carrier and tracking number → SHIPPED. The customer confirms fit → `confirmFitAndRelease` captures every live authorization (original + add-on) with deterministic request IDs → RELEASED → `ai.writeReceipt` (Gemini 3.5 Flash-Lite) writes the explanation stored with the receipt. If the customer opens a dispute instead, the order goes to DISPUTED.

**Auto-capture.** The cron route finds SHIPPED orders where 7 days have passed since shipping, there is no fit confirmation and no problem report, and the authorization is on or past day 25 → capture → RELEASED → OrderEvent with actor "system".

**Cancel and dispute.** Cancel before authorization → CANCELLED. Cancel after authorization (up to CHECK_PASSED) → void every live authorization → VOIDED. Report a problem → DISPUTED, which `canTransition` treats as blocking both capture and void.

**Chat and receipt.** Messages are fetched with SWR polling every 3 s. The receipt page lists every OrderEvent in order, the checklist versions, verdicts with evidence, PayPal IDs, and the AI explanation.

### The cron workflow

```yaml
# .github/workflows/cron.yml
name: escrow-tick
on:
  schedule:
    - cron: "4-59/10 * * * *"   # every 10 min, off the top of the hour (UTC)
  workflow_dispatch:
jobs:
  tick:
    runs-on: ubuntu-latest
    steps:
      - name: Reauthorize and auto-capture due payments
        run: |
          curl -fsS --retry 3 --retry-delay 20 --max-time 120 -X POST \
            "$APP_URL/api/cron/reauthorize" \
            -H "Authorization: Bearer $CRON_SECRET"
        env:
          APP_URL: ${{ secrets.APP_URL }}
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

The retries and the 120-second timeout absorb Render's ~1-minute cold start; a 10-minute interval keeps one free service awake (about 720 h/month against the 750 h allowance) and keeps Supabase active ([Render free](https://render.com/docs/free), [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing)). The route compares the bearer token with `CRON_SECRET` using a constant-time comparison and is idempotent, because GitHub may run it late or twice.

## Phase plan: eight phases, three days (phase table)

The order is deliberate: the riskiest and most central work (the payment state machine and PayPal) comes first, everything hangs off the Order/ChecklistVersion schema, AI can be stubbed with fixtures, and polish comes last. If Tier 1 is not working by **Nov 11 noon**, everything else becomes "future work".

| Phase | Dates | Goal | Deliverables | Done when | Testing | Tool |
|---|---|---|---|---|---|---|
| **0 Foundation** | Nov 9 evening | Running skeleton on real infra | Next 16 scaffold (src/, no Cache Components), MIT license, `.env.example`, CLAUDE.md, `.claude/` skill + hooks, Prisma 7 schema + `prisma.config.ts`, Supabase DB + private bucket, `render.yaml`, `/api/health`, git repo | `/api/health` returns 200 on Render; migrations applied on Supabase | `npm run typecheck`, `curl` the Render URL | **Both.** Cowork: create PayPal app + sandbox accounts and tick Log in with PayPal (day-1 check), Supabase dev/demo projects + bucket, Firebase project + test number on Spark (day-1 check), Resend key + test email to own address, Anthropic credits, Render service + env, GitHub secrets, read event rules. Code: scaffold, schema, render.yaml, deploy (plan mode) |
| **1 Domain core** | Nov 10 AM | Pure business rules | `pricing.ts` (exists), `orderMachine.ts`, `versioning.ts` + tests | Every transition and total passes Vitest; no I/O in `src/domain` | Vitest unit tests incl. guard cases (DISPUTED blocks capture/void, round limits) | **Code** (plan mode for orderMachine) |
| **2 Identity** | Nov 10 AM | Two verified users | Auth.js + Prisma adapter, Resend magic link first, PayPal OAuth provider (2 h timebox), Firebase phone page + `/api/me/phone`, role choice, short profile, `proxy.ts` | Two seeded users log in and show verified badges | Manual login both ways on 127.0.0.1 and Render; unit test for profile mapping | **Both.** Cowork: Return URL + Advanced Options in PayPal app, Firebase test numbers + authorized domains, optional Resend domain. Code: everything else |
| **3 Payments** | Nov 10 PM | Real escrow mechanics | `src/server/paypal/*` (token cache, create AUTHORIZE, authorize, capture, void, reauthorize, request IDs), PayPal button, cron route + workflow, `scripts/paypal-smoke.ts` | `npm run paypal:smoke` runs authorize→capture and authorize→void with IDs stored | Sandbox smoke script; `PayPal-Mock-Response` negative tests (best effort); idempotency test (same request ID twice) | **Both.** Cowork: extra sandbox buyer accounts, note credentials in a password manager. Code: client, routes, script |
| **4 AI** | Nov 11 AM | Four AI calls behind contracts | `src/server/ai/*` (client, schemas, images, checklist, change, verify, receipt, prompts), fixtures | Fixture contract tests pass; live calls work on 3 sample chats | Zod contract tests on saved fixtures; one live smoke per prompt; refusal/max_tokens path → NEEDS_MANUAL_REVIEW | **Both.** Cowork: sample chats in English, Tamil, Hindi (incl. code-mixed), reference and outfit photos (pass and fail cases). Code: modules + tests (use `/claude-api`) |
| **5 Full flow + UI** | Nov 11 | Tier 1 end to end | `orderService` wiring, order pages, checklist review/accept, price entry, upload, verdict view, ship, fit confirmation, receipt timeline | **Tier-1 DoD**: one full order chat → released payment in sandbox on the hosted URL | Playwright happy path; manual void path; fresh-browser run on Render | **Code**, then **Cowork** reviews the payment state machine against `docs/decisions.md` (plus a second Claude Code reviewer session) |
| **6 Winning features** | Nov 11 PM – Nov 12 AM | Tier 2 | Add-on v2 + diff + counters + 2nd authorization; polling chat; light trust page (badges + portfolio); bilingual checklist display | Each shown working on the hosted URL, ready for the video | Vitest for versioning/add-on; manual add-on run with second authorization; Playwright smoke | **Code** (plan mode for add-ons) |
| **7 Ship** | Nov 12 | Submission | Seed data (`prisma/seed.ts`), README (sandbox accounts, test phone numbers, setup), Postman collection + environments, final deploy, demo video < 3 min, submission | Submission done | `npm run api:test` against Render; fresh-browser run; warm URL before recording | **Both.** Cowork: README narrative, video script, event rules check, submission form. Code: seed, Postman collection, final deploy, commits |

The expected-outcome docs define the submission: a working sandbox prototype covering chat, checklist, held payment, photo check, fit confirmation and release; a public repo with a license; a hosted demo or setup instructions; a text description; and a demo video under 3 minutes.

### Testing strategy across phases

Domain code gets Vitest unit tests (the existing 9 pricing tests are the template). PayPal gets a sandbox integration script plus best-effort negative tests through `PayPal-Mock-Response`. AI gets Zod contract tests on saved fixtures plus one live smoke call per prompt. Playwright covers one happy path; the void path is manual. The API surface gets a Postman collection, run with Newman (`newman run postman/stitchsafe.postman_collection.json -e postman/render.postman_environment.json --bail`) or the Postman CLI, since Newman no longer receives updates ([Postman: Newman in CI](https://learning.postman.com/docs/reference/newman-cli/continuous-integration.md)). Postman is a sponsor, so the collection is worth showing. The final gate is a fresh-browser run on the Render URL after warming it.

### Risks and fallbacks

| Risk | Fallback |
|---|---|
| Log in with PayPal unavailable (limited release) or eats the timebox | Magic link for both roles; mention PayPal login as future work |
| Resend delivers only to the owner's email | One role on that email, the other via PayPal login, or verify a domain; if neither works, log a decision about a seed-only demo login before building one |
| Firebase test numbers need billing on Spark | Decide on day 1: enable Blaze with test numbers only, or show phone verification as a seeded badge and say so in the README |
| Add-on exceeds capture cap | Already solved: separate authorization |
| Hold expiry | Reauthorize once, 29-day cap, explain in README |
| AI bad JSON or wrong verdict | Structured outputs + Zod + retry + manual review; server checks state; customer keeps final fit call |
| Render cold start during judging | 10-minute cron keeps it warm; record the video locally if needed |
| Three-day timeline | Tier 1 by Nov 11 noon; everything else is future work |

## Claude Code builds the repo, Claude Cowork handles everything outside it

Claude Code "can read your files, run commands, make changes" and follows an explore → plan → implement → commit loop ([Claude Code best practices](https://code.claude.com/docs/en/best-practices.md)); it owns everything inside the repository: scaffold, schema, migrations, `render.yaml`, domain code and tests, PayPal client and smoke script, Auth.js and Firebase verification, AI modules and fixtures, `orderService`, route handlers, UI, polling chat, Postman collection, Playwright, per-phase commits and build fixes. Claude Cowork runs tasks in an isolated cloud environment, drives a built-in browser, reads and writes connected folders, and organizes work in Projects with their own instructions and memory, but its documentation does not cover git or multi-file coding workflows ([Get started with Cowork](https://support.claude.com/en/articles/13345190-get-started-with-cowork)). That makes Claude Cowork, working inside the "STITCH-SAFE [PAYPAL]" project, the right tool for console setup in the browser (PayPal developer app, sandbox accounts, Log in with PayPal settings, Supabase, Firebase test numbers, Render env vars, GitHub secrets), reading the event page for rules and deadline, producing demo inputs (sample chats in three languages, reference and outfit photos, seed scenario), keeping `docs/decisions.md`, writing the README narrative and video script, filling in the submission form, and a second review of the payment state machine before Phase 5.

The hand-off loop: Claude Cowork writes `docs/decisions.md` and keeps the handover files in the project folder; Claude Code reads them at the start of each phase through CLAUDE.md and the phase skill; the phase output (handover file + commit commands) returns to Saikalyan, who confirms receipt before the next phase, as the project instructions require. The per-phase split is in the "Tool" column of the phase table.

## Skills and workflows

### Existing skills to install or use

| Skill | Where | Use in StitchSafe |
|---|---|---|
| Gemini API docs (ai.google.dev) | Claude Code (WebFetch) | Phase 4: confirm current `@google/genai` shapes for structured JSON output and image input before coding ([Gemini models](https://ai.google.dev/gemini-api/docs/models)) |
| `/code-review` (bundled) | Claude Code | Before every commit; reviews the diff in a fresh subagent. Ask it to report correctness gaps only ([Best practices](https://code.claude.com/docs/en/best-practices.md)) |
| `/verify`, `/run`, `/debug` (bundled) | Claude Code | Check the running app; debug failing routes |
| frontend-design (anthropics/skills) | Claude Code | Phase 5-6 UI pass ([catalog](https://codenote.net/en/posts/anthropic-official-skills-catalog-overview/), secondary) |
| webapp-testing (anthropics/skills) | Claude Code | Playwright happy path with screenshots and browser logs |
| skill-creator (anthropics/skills) | Claude Code or app | Tune the `stitchsafe-phase` description for better triggering |
| Postgres best practices (`npx skills add supabase/agent-skills`) | Claude Code | Schema indexes and connection management on Supabase ([Supabase blog](https://supabase.com/blog/postgres-best-practices-for-ai-agents)) |
| Next.js best-practice skills (e.g. `next-best-practices`) | Claude Code | App Router, async params, route handlers. Use the Next.js parts only; ignore any Vercel deployment advice, since hosting is Render |
| docx / pptx (anthropics/skills) | Claude Cowork | Submission document or pitch slides if the event asks for them |
| Code-intelligence plugin for TypeScript | Claude Code `/plugin` | Recommended for typed languages ([Best practices](https://code.claude.com/docs/en/best-practices.md)) |

The install path for anthropics/skills (`/plugin marketplace add anthropics/skills`) could not be confirmed from the primary README. Skills enabled in the Claude app also load in Claude Code when signed in with the same account (v2.1.273+, one-way) ([Use Skills in Claude](https://support.claude.com/en/articles/12512180-use-skills-in-claude)).

### Workflows

**Plan mode** (Shift+Tab, or `claude --permission-mode plan`) for Phase 0, the order machine, `orderService` wiring and add-ons; skip it when the diff fits in one sentence ([Best practices](https://code.claude.com/docs/en/best-practices.md)). **`/clear` between phases**, starting each phase from its handover file; after two failed corrections, `/clear` and re-prompt. **Handover files** `docs/handover_phase_N.md` with Parts A, B and C after every phase, as the project instructions require. **Git commit per phase**, because checkpoints "only track changes made through Claude's file editing tools" and are "not a replacement for git" ([Best practices](https://code.claude.com/docs/en/best-practices.md)). **Writer/reviewer second session**: a fresh Claude Code session reviews `orderService` and the PayPal client against `docs/decisions.md` before Phase 5, because "a fresh context improves code review" ([Best practices](https://code.claude.com/docs/en/best-practices.md)). **Show evidence**: Claude should paste test output rather than assert success.

**Hooks** make the two most important rules deterministic, since CLAUDE.md is advisory and "to block an action regardless of what Claude decides, use a PreToolUse hook" ([CLAUDE.md docs](https://code.claude.com/docs/en/claudemd)). The hooks guide's protect-files pattern exits with code 2 to block an edit and feeds the message back to Claude ([Hooks guide](https://code.claude.com/docs/en/hooks-guide.md)); a Stop hook blocks the turn from ending until the check passes ([Best practices](https://code.claude.com/docs/en/best-practices.md)). Node scripts are used instead of shell scripts so they also run on Saikalyan's Windows PC.

File `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.mjs\"" }]
      }
    ],
    "Stop": [
      {
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/verify.mjs\"" }]
      }
    ]
  }
}
```

```js
// .claude/hooks/protect-files.mjs
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input || "{}");
  const file = String(data?.tool_input?.file_path ?? "").replace(/\\/g, "/");
  const base = file.split("/").pop() ?? "";
  const isSecretEnv = base.startsWith(".env") && base !== ".env.example";
  const isMigration = file.includes("/prisma/migrations/");
  const isGitInternal = file.includes("/.git/");
  if (isSecretEnv || isMigration || isGitInternal) {
    process.stderr.write(
      `Blocked: ${file} is protected (secrets, generated migrations or git internals). ` +
        "Update .env.example instead, or ask the user to make this change.",
    );
    process.exit(2);
  }
  process.exit(0);
});
```

```js
// .claude/hooks/verify.mjs
import { execSync } from "node:child_process";
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const data = JSON.parse(input || "{}");
  if (data.stop_hook_active) process.exit(0); // avoid an endless fix loop
  try {
    execSync("npm run typecheck && npm test", { stdio: "pipe" });
    process.exit(0);
  } catch (error) {
    const out = `${error.stdout ?? ""}${error.stderr ?? ""}`.slice(-4000);
    process.stderr.write(`Typecheck or tests failed. Fix them before finishing:\n${out}`);
    process.exit(2);
  }
});
```

The `stop_hook_active` guard is from the hooks API as generally documented rather than from the fetched guide; confirm it with `/hooks` after setup. The test script is `vitest run --passWithNoTests` so the Stop hook does not fail in Phase 0 before tests exist. Migrations are still created normally, because `prisma migrate dev` runs through Bash rather than the Edit/Write tools.

Allowlist the routine commands with `/permissions`: `npm run *`, `npx prisma *`, `git add`, `git commit`, `git status`, `git log`.

## Custom project skill: stitchsafe-phase

Save as `.claude/skills/stitchsafe-phase/SKILL.md` in the repo and run it with `/stitchsafe-phase 0`, `/stitchsafe-phase 1`, and so on. Only the open-standard fields `name` and `description` are used in the frontmatter, because claude.ai uploads "reject other fields with a hard error" ([Skills docs](https://code.claude.com/docs/en/skills)), so the same folder can be zipped and uploaded to the Claude app for Claude Cowork. Without `disable-model-invocation`, Claude may also load the skill when Saikalyan says "start phase 2"; the skill's Step 7 stop rule keeps that safe.

````markdown
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
| 0 | Foundation: Next.js 16 scaffold (src/, no Cache Components), MIT license, .env.example, Prisma 7 schema + prisma.config.ts, Supabase DB + bucket, render.yaml, /api/health, git init | /api/health returns 200 on Render; migrations applied on Supabase |
| 1 | Domain core: pricing.ts, orderMachine.ts, versioning.ts + Vitest | every transition and total passes Vitest; no I/O in src/domain |
| 2 | Identity: Resend magic link first, Log in with PayPal (2-hour timebox), Firebase phone code, roles + short profile | two seeded users log in and show verified badges |
| 3 | Payments: PayPal token cache, create (AUTHORIZE), authorize, capture, void, reauthorize, PayPal-Request-Id, button, cron endpoint | `npm run paypal:smoke` runs authorize→capture and authorize→void with IDs stored |
| 4 | AI: checklist builder, change writer, photo checker, receipt writer; Zod + 1 retry + NEEDS_MANUAL_REVIEW | fixture contract tests pass; live calls work on 3 sample chats |
| 5 | Full flow + UI: order pages, checklist review/accept, upload, verdict, ship, fit confirmation, receipt timeline | one full order chat → released payment in sandbox on the hosted URL |
| 6 | Winning features: add-on v2 + diff + counters + second authorization; polling chat; light trust page | each feature works on the hosted URL and can be shown in the video |
| 7 | Ship: seed demo data, README, Postman collection, final deploy | fresh-browser run on hosted URL passes; submission assets ready |

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
````

## CLAUDE.md for the repo

This replaces CLAUDE.md v1. It keeps every hard rule from v1, updates the stack and versions, and stays under 200 lines, the size the docs recommend because "longer files consume more context and reduce adherence" ([CLAUDE.md docs](https://code.claude.com/docs/en/claudemd)). Multi-step procedures live in the skill; detailed policy lives in `docs/decisions.md`.

````markdown
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
- Phone OTP: Firebase phone auth with test numbers (`firebase` 13.2.0 client); server verifies the ID token with `firebase-admin` 14.5.0.
- AI: Google Gemini via an AI Studio key (free tier). `@google/genai` (exact version pinned in package.json) + Zod 4 + `sharp`. `GEMINI_MODEL_VISION=gemini-3.8-flash` (checklist builder, photo checker); `GEMINI_MODEL_FAST=gemini-3.5-flash-lite` (change writer, receipt writer). All provider-specific code lives in `src/server/ai/client.ts`, so the provider can be swapped back to Claude by changing that file and the env vars.
- Payments: PayPal Orders v2 + Payments v2 REST via `fetch`. Buttons: `@paypal/react-paypal-js` 10.1.2, legacy `PayPalScriptProvider` with `intent: "authorize"`, `currency: "USD"`; the server creates every order with `intent: "AUTHORIZE"`.
- Chat: SWR polling every 3 s on `/api/orders/[id]/messages`.
- Scheduler: GitHub Actions cron → `POST /api/cron/reauthorize` with `Authorization: Bearer $CRON_SECRET`.
- Tests: Vitest 5.1.0, Playwright 1.65.0, Postman collection run by Newman 6.2.3 (deprecated) or Postman CLI.
- Hosting: Render free web service from `render.yaml`. Repo: public GitHub, MIT.

## Framework gotchas

- Next 16: route protection lives in `src/proxy.ts` exporting `proxy()` (Node runtime). There is no `middleware.ts`.
- Next 16: `params`, `searchParams`, `cookies()`, `headers()` are async. Route handler: `const { id } = await ctx.params`.
- Cache Components are OFF. Do not add `"use cache"`. `next lint` no longer exists; use `npm run lint`.
- Route handlers that touch Prisma, the Gemini SDK (`@google/genai`), firebase-admin or sharp start with `export const runtime = "nodejs";`.
- Prisma 7: the CLI URL lives in `prisma.config.ts` (`DIRECT_URL`, port 5432, imports `dotenv/config`). The runtime client uses `new PrismaPg({ connectionString: DATABASE_URL })` (pooler, port 6543). Generator `prisma-client` outputs to `src/generated/prisma` (gitignored); import from `@/generated/prisma/client`.
- Prisma 7: `migrate dev` does not run `generate` or seed. Run `npm run db:generate` after every schema change.
- `NEXT_PUBLIC_*` values are inlined at build time; on Render they must exist before the build.
- Gemini: call `ai.models.generateContent` with `config.responseMimeType: "application/json"` and `config.responseJsonSchema` built from `z.toJSONSchema(Schema)`, then `Schema.parse(JSON.parse(response.text))`. Treat a block/SAFETY/MAX_TOKENS finish or a parse failure like a bad output: retry once, then NEEDS_MANUAL_REVIEW. Images go as `inlineData` base64 JPEG after server download, EXIF strip and resize (long edge <= 1568 px). Free tier: low rate limits (check AI Studio) and Google may use inputs to improve its products, so only sample photos. Verify SDK shapes against current ai.google.dev docs before writing Phase 4 code.
- Firebase phone auth does not work on `localhost`; use `http://127.0.0.1:3000` locally.
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

- `npm run dev`: local app at http://127.0.0.1:3000
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

Phase 0 — Foundation (not started)
````

## Conclusion

The research did not change what StitchSafe is; it changed where the risk sits. The PayPal escrow mechanics are well documented and fit the user's decisions cleanly once add-ons get their own authorization, so the payment phase is now less risky than the sign-in phase: both Log in with PayPal (limited-release docs) and the magic-link fallback (Resend's own-address restriction) can fail on a fresh account, and Firebase test numbers may need billing. Those three checks belong in the first hour of Phase 0, done by Claude Cowork in the browser, before any code depends on them.

The second shift is that several rules moved from "instructions to the AI" to "structure the AI cannot break". Price fields are absent from the AI schemas, structured outputs enforce shape, PayPal request IDs make double captures impossible inside six hours, a PreToolUse hook makes `.env` edits impossible, and a Stop hook makes "done" mean "typecheck and tests pass". For a solo three-day build, that is the difference between a demo that holds up when a judge clicks twice and one that does not. One question remains open for Saikalyan: how the day-25 auto-capture rule should treat orders shipped after day 18.

## Appendix: src/domain/pricing.ts and its tests

```ts
// src/domain/pricing.ts
// The only place StitchSafe computes money. Pure functions, integer cents, no I/O.

export type PriceLineKind = "BASE" | "RUSH" | "SHIPPING" | "CUSTOMS" | "ADDON";

export interface PriceLine {
  kind: PriceLineKind;
  label: string;
  amountCents: number;
}

export interface DiscountPolicy {
  percentBps: number; // 1000 bps = 10%
  eligible: boolean; // true only for the customer's first order with this tailor
}

export interface OrderTotals {
  baseCents: number;
  rushCents: number;
  shippingCents: number;
  customsCents: number;
  appliedDiscountBps: number;
  discountCents: number;
  totalCents: number;
}

export interface AddOnTotals {
  addOnCents: number;
  originalTotalCents: number;
  newGrandTotalCents: number;
  jumpBps: number;
  isLargeJump: boolean;
}

export interface PayPalAmount {
  currency_code: "USD";
  value: string;
  breakdown: {
    item_total: { currency_code: "USD"; value: string };
    handling: { currency_code: "USD"; value: string };
    shipping: { currency_code: "USD"; value: string };
    tax_total: { currency_code: "USD"; value: string };
    discount: { currency_code: "USD"; value: string };
  };
}

export const DEFAULT_FIRST_ORDER_DISCOUNT_BPS = 1000;
export const MAX_DISCOUNT_BPS = 3000;
export const LARGE_JUMP_THRESHOLD_BPS = 5000;

export class PricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function assertCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError(`${label} must be a non-negative integer number of cents, got ${value}`);
  }
}

export function percentOf(amountCents: number, bps: number): number {
  assertCents(amountCents, "amountCents");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new PricingError(`bps must be an integer between 0 and 10000, got ${bps}`);
  }
  return Math.floor((amountCents * bps + 5000) / 10000);
}

function sumKind(lines: PriceLine[], kind: PriceLineKind): number {
  return lines.filter((l) => l.kind === kind).reduce((acc, l) => acc + l.amountCents, 0);
}

export function computeOrderTotals(lines: PriceLine[], discount: DiscountPolicy): OrderTotals {
  if (lines.length === 0) throw new PricingError("at least one price line is required");
  for (const line of lines) {
    assertCents(line.amountCents, `line "${line.label}"`);
    if (line.kind === "ADDON") {
      throw new PricingError("ADDON lines belong to an add-on, not the original order");
    }
  }
  if (!Number.isInteger(discount.percentBps) || discount.percentBps < 0 || discount.percentBps > MAX_DISCOUNT_BPS) {
    throw new PricingError(`discount must be between 0 and ${MAX_DISCOUNT_BPS} bps, got ${discount.percentBps}`);
  }

  const baseCents = sumKind(lines, "BASE");
  if (baseCents <= 0) throw new PricingError("BASE lines must total more than zero");

  const rushCents = sumKind(lines, "RUSH");
  const shippingCents = sumKind(lines, "SHIPPING");
  const customsCents = sumKind(lines, "CUSTOMS");

  const appliedDiscountBps = discount.eligible ? discount.percentBps : 0;
  const discountCents = percentOf(baseCents, appliedDiscountBps);
  const totalCents = baseCents + rushCents + shippingCents + customsCents - discountCents;

  return { baseCents, rushCents, shippingCents, customsCents, appliedDiscountBps, discountCents, totalCents };
}

export function computeAddOnTotals(original: OrderTotals, addOnLines: PriceLine[]): AddOnTotals {
  if (addOnLines.length === 0) throw new PricingError("an add-on needs at least one line");
  for (const line of addOnLines) {
    assertCents(line.amountCents, `add-on line "${line.label}"`);
    if (line.kind !== "ADDON") throw new PricingError("add-on lines must have kind ADDON");
  }
  const addOnCents = sumKind(addOnLines, "ADDON");
  if (addOnCents <= 0) throw new PricingError("add-on must total more than zero");

  const jumpBps = Math.floor((addOnCents * 10000) / original.totalCents);
  return {
    addOnCents,
    originalTotalCents: original.totalCents,
    newGrandTotalCents: original.totalCents + addOnCents,
    jumpBps,
    isLargeJump: jumpBps >= LARGE_JUMP_THRESHOLD_BPS,
  };
}

export function formatCents(cents: number): string {
  assertCents(cents, "cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function usd(cents: number): { currency_code: "USD"; value: string } {
  return { currency_code: "USD", value: formatCents(cents) };
}

export function toPayPalAmount(totals: OrderTotals): PayPalAmount {
  return {
    currency_code: "USD",
    value: formatCents(totals.totalCents),
    breakdown: {
      item_total: usd(totals.baseCents),
      handling: usd(totals.rushCents),
      shipping: usd(totals.shippingCents),
      tax_total: usd(totals.customsCents),
      discount: usd(totals.discountCents),
    },
  };
}

export function toPayPalAddOnAmount(addOn: AddOnTotals): PayPalAmount {
  return {
    currency_code: "USD",
    value: formatCents(addOn.addOnCents),
    breakdown: {
      item_total: usd(addOn.addOnCents),
      handling: usd(0),
      shipping: usd(0),
      tax_total: usd(0),
      discount: usd(0),
    },
  };
}
```

```ts
// tests/domain/pricing.test.ts
import { describe, expect, it } from "vitest";
import {
  computeAddOnTotals,
  computeOrderTotals,
  DEFAULT_FIRST_ORDER_DISCOUNT_BPS,
  formatCents,
  percentOf,
  PricingError,
  toPayPalAmount,
  type PriceLine,
} from "../../src/domain/pricing";

const lines: PriceLine[] = [
  { kind: "BASE", label: "Silk blouse stitching", amountCents: 15000 },
  { kind: "BASE", label: "Lining", amountCents: 3000 },
  { kind: "RUSH", label: "Rush fee", amountCents: 2000 },
  { kind: "SHIPPING", label: "International shipping", amountCents: 2500 },
  { kind: "CUSTOMS", label: "Customs duty", amountCents: 1000 },
];

const firstOrder = { percentBps: DEFAULT_FIRST_ORDER_DISCOUNT_BPS, eligible: true };
const repeatOrder = { percentBps: DEFAULT_FIRST_ORDER_DISCOUNT_BPS, eligible: false };

describe("percentOf", () => {
  it("rounds half up", () => {
    expect(percentOf(12345, 1000)).toBe(1235);
    expect(percentOf(12344, 1000)).toBe(1234);
  });
});

describe("computeOrderTotals", () => {
  it("applies 10% only to BASE lines on a first order", () => {
    const t = computeOrderTotals(lines, firstOrder);
    expect(t.baseCents).toBe(18000);
    expect(t.discountCents).toBe(1800);
    expect(t.totalCents).toBe(18000 + 2000 + 2500 + 1000 - 1800);
    expect(t.appliedDiscountBps).toBe(1000);
  });

  it("gives no discount on a repeat order", () => {
    const t = computeOrderTotals(lines, repeatOrder);
    expect(t.discountCents).toBe(0);
    expect(t.totalCents).toBe(23500);
  });

  it("rejects ADDON lines, negative amounts, floats and discounts above 30%", () => {
    expect(() => computeOrderTotals([{ kind: "ADDON", label: "x", amountCents: 100 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals([{ kind: "BASE", label: "x", amountCents: -1 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals([{ kind: "BASE", label: "x", amountCents: 10.5 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals(lines, { percentBps: 3500, eligible: true })).toThrow(PricingError);
  });

  it("requires a positive BASE subtotal", () => {
    expect(() => computeOrderTotals([{ kind: "SHIPPING", label: "x", amountCents: 500 }], firstOrder)).toThrow(PricingError);
  });
});

describe("computeAddOnTotals", () => {
  it("handles the $200 -> $500 case and flags a large jump", () => {
    const original = computeOrderTotals([{ kind: "BASE", label: "Kurta", amountCents: 20000 }], repeatOrder);
    const a = computeAddOnTotals(original, [{ kind: "ADDON", label: "Embroidery", amountCents: 30000 }]);
    expect(a.addOnCents).toBe(30000);
    expect(a.newGrandTotalCents).toBe(50000);
    expect(a.jumpBps).toBe(15000);
    expect(a.isLargeJump).toBe(true);
  });

  it("does not flag a small add-on", () => {
    const original = computeOrderTotals([{ kind: "BASE", label: "Kurta", amountCents: 20000 }], repeatOrder);
    const a = computeAddOnTotals(original, [{ kind: "ADDON", label: "Buttons", amountCents: 1500 }]);
    expect(a.isLargeJump).toBe(false);
  });
});

describe("toPayPalAmount", () => {
  it("builds a breakdown that adds up to the value", () => {
    const amount = toPayPalAmount(computeOrderTotals(lines, firstOrder));
    expect(amount.value).toBe("217.00");
    expect(amount.breakdown.item_total.value).toBe("180.00");
    expect(amount.breakdown.handling.value).toBe("20.00");
    expect(amount.breakdown.shipping.value).toBe("25.00");
    expect(amount.breakdown.tax_total.value).toBe("10.00");
    expect(amount.breakdown.discount.value).toBe("18.00");
  });

  it("formats cents", () => {
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(123456)).toBe("1234.56");
  });
});
```
