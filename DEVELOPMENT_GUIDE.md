# StitchSafe — Development Guide & Best Practices

## 1. Prerequisites
- **Node.js:** v20.x or v22.x LTS
- **Package Manager:** `npm` (or `pnpm`)
- **Database:** PostgreSQL instance (Supabase connection URL in `.env.local`)
- **APIs:** Google Gemini API Key (`GEMINI_API_KEY`), PayPal Sandbox credentials.

## 2. Common Development Commands
```bash
# Install dependencies
npm install

# Start local Next.js development server
npm run dev

# Run full Vitest test suite (192 unit & integration tests)
npm test

# Run ESLint validation
npm run lint

# Run TypeScript compilation check
npm run typecheck

# Database migrations & schema generation
npm run db:generate
npm run db:push
```

## 3. Strict Coding Standards & Invariants
1. **Never use floats for money:** All price math must use integer cents (`amountCents`). Import `formatCents` from `@/domain/pricing` for display purposes only.
2. **Never invoke AI or PayPal inside route handlers:** All business logic, state transitions, PayPal API calls, and Gemini AI queries must go through `src/server/services/orderService.ts`.
3. **Transaction Safety:** Every order state mutation must occur within `prisma.$transaction`, asserting the current state before updating and appending an `OrderEvent`.
4. **No Base64 image bloat in database:** Never store raw image base64 strings in `OrderEvent.payload` or Prisma models. Use object storage paths.
5. **Next.js 16 Runtime Export:** Any API route handler importing Prisma, Sharp, or Google Gen AI must declare `export const runtime = "nodejs";`.

