# StitchSafe — Project Overview & Core Mission

## 1. Executive Summary
**StitchSafe** is an escrow-backed, AI-verified milestone commerce platform tailored specifically for the bespoke tailoring and custom garment industry. It bridges the trust deficit between remote/boutique tailors (e.g., **Sri Karthika Tailors**) and discerning global clients (e.g., **Priya Sundaram**).

## 2. Core Problem & Real-World Solution
- **The Problem:** In custom tailoring, customers face severe risks: paying upfront for garments that might not fit or meet fabric specifications, or losing money to distant vendors with zero recourse. Tailors face non-paying customers after cutting expensive fabric.
- **The StitchSafe Solution:**
  1. **Dual Portal Experience:** Dedicated entry points for Tailor Studio (`/tailor`) and Customer Portal (`/customer` via PayPal integration).
  2. **AI-Assisted Checklist Protocol:** Gemini 2.5 Flash decomposes customer garment descriptions or reference photos into objective, verifiable quality checklist items (sleeve length, neckline, piping, embroidery, fit).
  3. **Customer Customization:** Customer retains full editing control over the checklist in Draft/Proposed stages (add, modify, delete, toggle inspection method) before agreeing.
  4. **Escrow Payment Hold (PayPal):** Funds are authorized and held securely in escrow prior to cutting. Money is never captured until the customer approves the finished product or confirms fit.
  5. **Mandatory Tailor Proof & AI Vision Verification:** Tailor must upload finished garment photos before dispatch. Gemini 2.5 Flash Vision checks the photos against every agreed checklist item with structured verdicts (`MET`, `PARTLY_MET`, `NOT_MET`).
  6. **Interactive Collaboration (Order Chat):** Real-time messaging with quick suggestion chips allows tailor and client to clarify measurements, share fabric updates, and coordinate delivery.
  7. **Customer Fit Confirmation & Release:** Upon delivery, customer inspects the physical garment, confirms fit criteria, and safely releases payment with an official audit receipt.

## 3. Key Actors & Realistic Test Profiles
- **Master Tailor:**
  - **Name:** Sri Karthika Tailors
  - **Email:** `gsaikalyan2@gmail.com`
  - **Role:** `TAILOR`
  - **Dashboard:** `/tailor` (Active orders, deadlines, photo proof submission, progress notes, price quotation)
- **Customer:**
  - **Name:** Priya Sundaram
  - **Email:** `demo-customer@stitchsafe.internal` (or PayPal OAuth)
  - **Role:** `CUSTOMER`
  - **Dashboard:** `/customer` (Order creation, checklist editing, PayPal hold authorization, live chat, fit release)

## 4. Key Architectural Invariants
1. **Integer Money Representation:** All monetary amounts are strictly stored and computed as integer cents (`amountCents`, `totalCents`). Currency display uses `formatCents`. Floating-point arithmetic for currency is strictly prohibited.
2. **AI Isolation from Pricing:** AI generates checklists and verifies visual compliance, but NEVER sets monetary prices or fees.
3. **Single Service Orchestration:** All business logic, PayPal calls, and AI invocations run exclusively through `src/server/services/orderService.ts`. Route handlers do not touch PayPal or AI directly.
4. **Append-Only Event Ledger:** Every state change, authorization, capture, or rejection logs an immutable `OrderEvent` within a atomic Prisma transaction.

