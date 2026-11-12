# StitchSafe

**Escrow-backed, AI-verified milestone payments for custom tailoring.**

StitchSafe sits between a tailor and a customer. The customer's money is *authorized* on PayPal (held, not charged) before the fabric is cut, an AI checks the finished garment's photos against an agreed checklist, and the payment is only *captured* once the customer confirms the fit. Built for the PayPal hackathon.

- **License:** MIT
- **Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Prisma 7 + PostgreSQL (Supabase) · Auth.js v5 · PayPal Orders/Authorize/Capture · Google Gemini · Firebase phone OTP · Resend · Tailwind CSS 4

---

## How it works

1. **Customer describes the garment** (text and/or reference photo). Gemini turns it into an objective, verifiable checklist (sleeve length, neckline, piping, fit, ...).
2. **Both sides agree** on the checklist and price. The customer can edit the checklist until they agree. AI never sets prices.
3. **Customer authorizes payment** with PayPal. Funds are held in escrow; nothing is captured yet. A scheduled job re-authorizes holds before they expire.
4. **Tailor works, chats, and uploads proof photos.** Gemini Vision rates every checklist item `MET`, `PARTLY_MET` or `NOT_MET`.
5. **Customer confirms fit** after delivery. Payment is captured, and an AI-written receipt is produced.

Order lifecycle: `DRAFT → PROPOSED → AGREED → AUTHORIZED → IN_PROGRESS → SUBMITTED → CHECK_PASSED / CHECK_FAILED → SHIPPED → RELEASED` (also `CANCELLED`, `VOIDED`, `DISPUTED`).

Design rules the code follows: money is integer cents only; all PayPal and AI calls go through `src/server/services/orderService.ts` (never route handlers); every state change is a Prisma transaction that appends an immutable `OrderEvent`; images live in object storage, never as base64 in the DB.

---

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | **>= 20.19** (20 LTS or 22 LTS) |
| npm | comes with Node |
| Git | any recent version |

You also need free accounts on the external services below (all have free/sandbox tiers).

---

## 1. Get the code

```bash
git clone https://github.com/gsaikalyan2-coder/stitchsafe.git
cd stitchsafe
npm install
```

## 2. Create the external services

| Service | What it is used for | What to create |
|---|---|---|
| [Supabase](https://supabase.com) | PostgreSQL database + private photo storage | A project, and a **private** Storage bucket named `stitchsafe-photos` |
| [PayPal Developer](https://developer.paypal.com) | Sandbox payments (authorize/capture/void) and "Log in with PayPal" | A sandbox REST app (client ID + secret) and a sandbox buyer account |
| [Resend](https://resend.com) | Email magic-link sign-in | An API key. Without a verified domain, use `onboarding@resend.dev`; it only delivers to the email that owns the Resend account |
| [Firebase](https://console.firebase.google.com) | Phone OTP verification | A project with Phone sign-in enabled and **test phone numbers** added. Add `localhost` to Authorized domains |
| [Google AI Studio](https://aistudio.google.com) | Gemini (checklist, photo verification, receipts) | An API key |

> Gemini's free tier may use inputs to improve Google products. Use sample/demo photos only.

## 3. Configure environment variables

```bash
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Fill in `.env`. **Never commit it** (it is already in `.gitignore`).

| Variable | Description |
|---|---|
| `AUTH_URL` | Public URL of the app. Locally `http://localhost:3000` |
| `AUTH_TRUST_HOST` | `true` (needed behind proxies such as Render) |
| `AUTH_SECRET` | Random string: `npx auth secret` or `openssl rand -base64 32` |
| `CRON_SECRET` | Random string: `openssl rand -hex 32`. Protects `POST /api/cron/reauthorize` |
| `DATABASE_URL` | Supabase **transaction pooler** (port 6543, `?pgbouncer=true`). Used by the app at runtime |
| `DIRECT_URL` | Supabase direct/session connection (port 5432). Used by Prisma migrations |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key. Never expose to the browser |
| `SUPABASE_BUCKET` | `stitchsafe-photos` |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | PayPal sandbox REST app credentials |
| `PAYPAL_API_BASE` | `https://api-m.sandbox.paypal.com` |
| `PAYPAL_WEB_BASE` | `https://www.sandbox.paypal.com` |
| `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | Same value as `PAYPAL_CLIENT_ID` (used by the PayPal JS button) |
| `PAYPAL_LOGIN_CLIENT_ID` / `PAYPAL_LOGIN_CLIENT_SECRET` | Credentials for the "Log in with PayPal" app. Can be the same app as above if Log in with PayPal is enabled on it |
| `AUTH_RESEND_KEY` | Resend API key |
| `EMAIL_FROM` | `onboarding@resend.dev` unless you have a verified domain |
| `SEED_TAILOR_EMAIL` / `SEED_CUSTOMER_EMAIL` | Emails for the seeded demo users. Set at least one to the Resend account owner's email |
| `PAYPAL_SANDBOX_BUYER_EMAIL` / `PAYPAL_SANDBOX_BUYER_PASSWORD` | Sandbox buyer login, used only by Playwright e2e tests |
| `NEXT_PUBLIC_FIREBASE_API_KEY` / `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` / `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web config |
| `FIREBASE_PROJECT_ID` | Firebase project ID (the server verifies ID tokens with the project ID only; no service-account key needed) |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL_VISION` | Vision model for checklist + photo checks (default in `.env.example`) |
| `GEMINI_MODEL_VISION_FALLBACK` | Used automatically on 503/429 |
| `GEMINI_MODEL_FAST` | Fast model for change and receipt writing |

## 4. Set up the database

```bash
npm run db:generate     # regenerate the Prisma client (also runs automatically on npm install)
npm run db:migrate      # apply migrations (uses DIRECT_URL)
npm run db:seed         # create the demo tailor and customer
```

On a fresh deployment target use `npx prisma migrate deploy` instead of `db:migrate`.

## 5. Start the server

```bash
npm run dev
```

Open **http://localhost:3000** (use `localhost`, not `127.0.0.1`, so auth cookies match `AUTH_URL`). Health check: `GET /api/health`.

Production build:

```bash
npm run build
npm start
```

---

## Trying the demo

`npm run db:seed` creates two users (emails come from your `.env`):

| Role | Name | Dashboard |
|---|---|---|
| Tailor | Sri Karthika Tailors | `/tailor` |
| Customer | Priya Sundaram | `/customer` |

The login page has a demo sign-in that signs you in as either seeded user. Real sign-in options are email magic link, Log in with PayPal, and phone OTP (Firebase test numbers only).

Suggested walkthrough: sign in as the customer → create an order with a garment description → edit the checklist → agree and authorize payment with the PayPal sandbox buyer → switch to the tailor → upload proof photos for AI verification → switch back to the customer → confirm fit and release payment.

> **Security note:** the demo sign-in (`POST /api/auth/demo-login`) mints a session for a seeded user without credentials. It exists for hackathon demos. Remove it or gate it before using this code for anything real.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / run |
| `npm run lint` | ESLint (`src`) |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest unit and integration tests |
| `npm run e2e` | Playwright e2e tests (start `npm run dev` first; base URL defaults to `http://127.0.0.1:3000`, override with `BASE_URL`) |
| `npm run db:generate` / `db:migrate` / `db:seed` | Prisma client / migrations / demo data |
| `npm run paypal:smoke` | Live PayPal sandbox smoke test (needs PayPal env vars) |
| `npm run ai:smoke` | Live Gemini smoke test (needs `GEMINI_API_KEY`; the photo-verify step is skipped unless you add `.jpg` files to `tests/ai/samples/photos/`) |

Before opening a PR: `npm run typecheck && npm run lint && npm test`.

---

## Scheduled re-authorization (cron)

PayPal authorizations expire, so `POST /api/cron/reauthorize` re-authorizes and auto-captures where due. It requires the header `Authorization: Bearer <CRON_SECRET>`.

- **Locally:** `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reauthorize`
- **In production:** `.github/workflows/cron.yml` calls it every 10 minutes. Add two GitHub repository secrets: `CRON_SECRET` and `APP_URL` (the deployed base URL).

## Deploying to Render

`render.yaml` defines a free Node web service (Singapore region). Its build runs `npm ci`, `prisma generate`, `prisma migrate deploy` and `npm run build`.

1. In Render, create a Blueprint from this repo.
2. Fill every variable marked `sync: false` in `render.yaml` (same list as the table above).
3. Set `AUTH_URL` to your Render URL, then add that URL to the PayPal app's return URLs and Firebase Authorized domains.
4. Add the `CRON_SECRET` and `APP_URL` GitHub secrets for the cron workflow.

---

## Project layout

```
src/
  app/            Next.js routes: pages (login, dashboard, tailor, customer, orders) and API (auth, orders, photos, cron, health)
  components/     UI components
  domain/         Pure business logic: order state machine, pricing (integer cents), capture gate, versioning
  server/
    services/     orderService.ts, the single orchestration layer
    paypal/       Orders, authorizations, PayPal client
    ai/           Gemini client, checklist, change writer, photo verify, receipt
    auth/         Auth.js config, PayPal provider, phone OTP
    storage/      Supabase Storage helpers
  lib/            Browser-side Firebase client
prisma/           schema.prisma, migrations, seed.ts
scripts/          paypal-smoke.ts, ai-smoke.ts
tests/            domain, services, server, ai, e2e
docs/             Build plan, decisions, per-phase handover notes
```

More detail: [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md), [`SYSTEM_ARCHITECTURE.md`](SYSTEM_ARCHITECTURE.md), [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md), [`DATABASE_DOCUMENTATION.md`](DATABASE_DOCUMENTATION.md), [`DEVELOPMENT_GUIDE.md`](DEVELOPMENT_GUIDE.md), [`docs/decisions.md`](docs/decisions.md).

## Troubleshooting

- **`Cannot find module '../src/generated/prisma/client'`**: run `npm run db:generate` (it normally runs on `npm install`).
- **Prisma migrate hangs or fails on port 6543**: migrations need `DIRECT_URL` (port 5432), not the pooler URL.
- **Signed in but bounced back to login**: open the app at `http://localhost:3000` and make sure `AUTH_URL` matches exactly.
- **Magic-link email never arrives**: with `onboarding@resend.dev`, Resend only delivers to the account owner's address.
- **Gemini 429/503**: the app falls back to `GEMINI_MODEL_VISION_FALLBACK`; free-tier quotas are low.

## Contributing

Issues and pull requests are welcome. Keep money in integer cents, route all PayPal/AI calls through `orderService.ts`, and add tests for domain changes.

## License

[MIT](LICENSE)
