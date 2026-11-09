// scripts/paypal-smoke.ts
// Smoke test for Phase 3 payments.
// npm run paypal:smoke
//
// Flow A: create PayPal order → print approve URL → wait for user to approve
//         in sandbox → authorize → walk state machine → capture → show idempotency.
// Flow B: separate order → create → approve → authorize → void.
// Cron:   correct token → 200; wrong token → 401; missing header → 401.

import "dotenv/config";
import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { OrderState as PrismaOrderState } from "../src/generated/prisma/client";
import { canTransition, OrderState } from "../src/domain/orderMachine";
import {
  createPayPalOrder,
  authorizePayment,
  captureAllLive,
  voidAllLive,
} from "../src/server/services/orderService";
import { captureAuthorization } from "../src/server/paypal/authorizations";
import { appendOrderEvent } from "../src/server/events";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ── helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[smoke] ${msg}`);
}

async function walkState(
  orderId: string,
  from: OrderState,
  to: OrderState,
  actorId: string,
  extra?: Record<string, unknown>,
) {
  if (!canTransition(from, to)) throw new Error(`Cannot transition ${from} → ${to}`);
  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: { state: to as unknown as PrismaOrderState, ...extra },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: from as unknown as PrismaOrderState,
      toState: to as unknown as PrismaOrderState,
      actorId,
      type: "STATE_CHANGE",
    });
  });
  log(`  → ${to}`);
}

async function upsertSmokeOrder(label: string): Promise<{ orderId: string; customerId: string }> {
  const tailorEmail = process.env.SEED_TAILOR_EMAIL;
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL;
  if (!tailorEmail || !customerEmail) {
    throw new Error("SEED_TAILOR_EMAIL and SEED_CUSTOMER_EMAIL must be set in .env");
  }

  const tailor = await prisma.user.upsert({
    where: { email: tailorEmail },
    update: {},
    create: { email: tailorEmail, name: "Smoke Tailor", role: "TAILOR", roleChosen: true },
  });

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {},
    create: { email: customerEmail, name: "Smoke Customer", role: "CUSTOMER", roleChosen: true },
  });

  const order = await prisma.order.create({
    data: {
      tailorId: tailor.id,
      customerId: customer.id,
      state: "AGREED",
      totalCents: 5000,
      discountApplied: false,
      discountBps: 0,
      checkRound: 0,
    },
  });

  log(`Created smoke order ${label}: ${order.id} (totalCents=5000, $50.00)`);
  return { orderId: order.id, customerId: customer.id };
}

async function printPayment(orderId: string, label: string) {
  const payments = await prisma.payment.findMany({ where: { orderId } });
  for (const p of payments) {
    log(
      `  [${label}] payment ${p.id}` +
        ` status=${p.status}` +
        ` paypalOrderId=${p.paypalOrderId ?? "-"}` +
        ` authId=${p.paypalAuthorizationId ?? "-"}` +
        ` captureId=${p.paypalCaptureId ?? "-"}`,
    );
  }
}

// ── Flow A ────────────────────────────────────────────────────────────────────

async function flowA(rl: readline.Interface): Promise<void> {
  log("=== Flow A: authorize → walk states → capture + idempotency ===");
  const { orderId, customerId } = await upsertSmokeOrder("A");

  // 1. Create PayPal order
  const { paypalOrderId, approveUrl } = await createPayPalOrder(orderId, customerId);
  log(`PayPal order created: ${paypalOrderId}`);
  log(`\nApprove URL:\n  ${approveUrl}\n`);

  // 2. Wait for sandbox buyer approval
  await rl.question("Open the URL above in a browser, log in as sandbox buyer, approve, then press Enter...\n");

  // 3. Authorize
  await authorizePayment(orderId, paypalOrderId, customerId);
  log("Payment authorized.");
  await printPayment(orderId, "after-authorize");

  // 4. Walk state machine: AUTHORIZED → IN_PROGRESS → SUBMITTED → CHECK_PASSED → SHIPPED
  await walkState(orderId, OrderState.AUTHORIZED, OrderState.IN_PROGRESS, customerId);
  await walkState(orderId, OrderState.IN_PROGRESS, OrderState.SUBMITTED, customerId);
  await walkState(orderId, OrderState.SUBMITTED, OrderState.CHECK_PASSED, customerId);
  await walkState(orderId, OrderState.CHECK_PASSED, OrderState.SHIPPED, customerId, {
    shippedAt: new Date(),
  });

  // 5. Capture
  await captureAllLive(orderId, customerId);
  log("Captured → RELEASED");
  await printPayment(orderId, "after-capture");

  // 6. Idempotency: call captureAuthorization again with the same authId
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  if (payment.paypalAuthorizationId) {
    log("Idempotency check: re-calling captureAuthorization with same authId...");
    const result2 = await captureAuthorization(payment.paypalAuthorizationId);
    log(`  First captureId:  ${payment.paypalCaptureId}`);
    log(`  Second captureId: ${result2.captureId}`);
    if (payment.paypalCaptureId === result2.captureId) {
      log("  ✓ Same captureId — idempotency confirmed.");
    } else {
      log("  ! Different captureIds (may happen if sandbox already expired the auth).");
    }
  }

  log("Flow A complete.\n");
}

// ── Flow B ────────────────────────────────────────────────────────────────────

async function flowB(rl: readline.Interface): Promise<void> {
  log("=== Flow B: authorize → void ===");
  const { orderId, customerId } = await upsertSmokeOrder("B");

  const { paypalOrderId, approveUrl } = await createPayPalOrder(orderId, customerId);
  log(`PayPal order created: ${paypalOrderId}`);
  log(`\nApprove URL:\n  ${approveUrl}\n`);

  await rl.question("Open the URL above, approve as sandbox buyer, then press Enter...\n");

  await authorizePayment(orderId, paypalOrderId, customerId);
  log("Payment authorized.");
  await printPayment(orderId, "after-authorize");

  await voidAllLive(orderId, customerId);
  log("Voided → VOIDED");
  await printPayment(orderId, "after-void");

  log("Flow B complete.\n");
}

// ── Cron check ────────────────────────────────────────────────────────────────

async function cronCheck(): Promise<void> {
  log("=== Cron bearer check (requires npm run dev running) ===");
  const appUrl = (process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log("CRON_SECRET not set — skipping cron check.");
    return;
  }

  async function check(label: string, headers: Record<string, string>, expected: number) {
    try {
      const res = await fetch(`${appUrl}/api/cron/reauthorize`, {
        method: "POST",
        headers,
        redirect: "manual",
      });
      let detail = "";
      if (res.status === 200) {
        const ct = res.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const body = await res.json() as Record<string, unknown>;
          detail = ` body=${JSON.stringify(body)}`;
          if (!("reauthorized" in body)) {
            log(`  ✗ ${label}: HTTP 200 but body missing 'reauthorized' field`);
            return;
          }
        } else {
          const text = (await res.text()).slice(0, 80);
          log(`  ✗ ${label}: HTTP 200 but content-type=${ct} (HTML redirect?): ${text}`);
          return;
        }
      }
      const mark = res.status === expected ? "✓" : "✗";
      log(`  ${mark} ${label}: HTTP ${res.status} (expected ${expected})${detail}`);
    } catch {
      log(`  ✗ ${label}: fetch failed (is the dev server running?)`);
    }
  }

  await check("correct token     ", { Authorization: `Bearer ${secret}` }, 200);
  await check("wrong token       ", { Authorization: "Bearer wrong-token-xx" }, 401);
  await check("missing header    ", {}, 401);
  await check("different length  ", { Authorization: "Bearer x" }, 401);

  log("Cron check complete.\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const cronOnly = process.argv.includes("--cron-only");
  const rl = readline.createInterface({ input, output });

  try {
    if (!cronOnly) {
      await flowA(rl);
      await flowB(rl);
    }
    await cronCheck();
    log("All smoke checks done.");
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err);
  prisma.$disconnect().finally(() => process.exit(1));
});
