# StitchSafe — System Architecture

## 1. Architectural Diagram & Layers

```
                     ┌──────────────────────────────┐
                     │     Browser Clients (UI)     │
                     │  - Tailor Studio (/tailor)   │
                     │  - Customer Portal (/customer│
                     │  - Order Detail & Live Chat  │
                     └──────────────┬───────────────┘
                                    │ HTTPS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js App Router (16)                         │
│                                                                        │
│   src/proxy.ts (Auth.js session verification & role-based routing)     │
│                                                                        │
│   src/app/api/orders/*  (Thin HTTP adapters, Zod input validation)     │
├────────────────────────────────────────────────────────────────────────┤
│                       Domain & Service Layer                           │
│                                                                        │
│   src/server/services/orderService.ts  (Central Orchestrator)          │
│   src/domain/orderMachine.ts           (Pure FSM State Machine)        │
│   src/domain/pricing.ts                (Integer Cent Calculations)     │
│   src/domain/captureGate.ts            (Auto-capture rules & dates)    │
├────────────────────────────────────────────────────────────────────────┤
│                     Integrations & Infrastructure                      │
│                                                                        │
│   src/server/ai/client.ts       --> Google Gemini 2.5 Flash API        │
│   src/server/paypal/client.ts   --> PayPal REST v2 API (Auth/Capture)  │
│   src/server/db.ts              --> Supabase Postgres (Prisma ORM)     │
└────────────────────────────────────────────────────────────────────────┘
```

## 2. Finite State Machine (FSM) Lifecycle
The lifecycle of an order is strictly governed by `src/domain/orderMachine.ts`:

```
 [DRAFT]
    │  (Tailor adds price lines & builds checklist)
    ▼
 [PROPOSED]
    │  (Customer reviews, customizes checklist, and accepts)
    ▼
 [AGREED]
    │  (Customer authorizes PayPal escrow hold)
    ▼
 [AUTHORIZED]
    │  (Tailor commences pattern cutting & stitching)
    ▼
 [IN_PROGRESS]
    │  (Tailor uploads finished work photos - Mandatory)
    ▼
 [SUBMITTED]
    │  (Gemini 2.5 Flash Vision evaluates photos vs checklist)
    ├─────────────────────────────┐
    ▼ (All items MET)             ▼ (Check failed)
 [CHECK_PASSED]                [CHECK_FAILED]
    │ (Tailor ships garment)      │ (Tailor rectifies & re-uploads, max 2 rounds)
    ▼                             ▼
 [SHIPPED]                     [CANCELLED / RESOLVED]
    │  (Customer inspects & confirms fit)
    ▼
 [RELEASED]  (Funds captured and transferred to tailor)
```

## 3. Communication Patterns
- **Frontend to Backend:** Next.js Server Components with Client Components utilizing optimistic UI, polling (`OrderChat`), and Server Actions / API route invocations.
- **Backend to Database:** Prisma ORM connected via session pooling with transaction boundaries (`prisma.$transaction`) ensuring ACID atomicity across order transitions and payment records.
- **Backend to PayPal:** Deterministic idempotency keys prevent duplicate authorizations. Captures only occur after customer fit confirmation or 7-day auto-capture gates.
- **Backend to Google Gemini AI:** Structured JSON schema extraction (`responseSchema`) ensures type-safe responses for checklist generation and multi-image visual inspection.

