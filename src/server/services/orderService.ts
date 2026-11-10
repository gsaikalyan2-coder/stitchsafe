// src/server/services/orderService.ts
// The ONLY place that combines domain + PayPal + DB.
// Route handlers call one function here; they never call PayPal or AI directly.
//
// Money flow safety contract:
//   1. Check canTransition / canActorTransition BEFORE calling PayPal.
//   2. Call PayPal OUTSIDE the transaction (network call, not inside DB tx).
//   3. Write DB changes + OrderEvent in a single prisma.$transaction(async tx => ...).
//   4. Re-read order state INSIDE the transaction before writing (optimistic re-check).
//   5. If PayPal succeeds but the DB write fails, retry with the same PayPal-Request-Id
//      — PayPal honours idempotency for 6 hours, so the retry is safe.

import { prisma } from "@/server/db";
import { canActorTransition, canTransition, OrderState } from "@/domain/orderMachine";
import type { Actor } from "@/domain/orderMachine";
import { toPayPalAmount } from "@/domain/pricing";
import {
  shouldAutoCapture,
  shouldReauthorize,
  effectiveHonorPeriodEnd,
} from "@/domain/authorizationDates";
import { appendOrderEvent } from "@/server/events";
import { createAuthorizeOrder, authorizeOrder } from "@/server/paypal/orders";
import {
  captureAuthorization,
  voidAuthorization,
  reauthorizeAuthorization,
} from "@/server/paypal/authorizations";
import type { PaymentStatus, OrderState as PrismaOrderState } from "@/generated/prisma/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDomainState(s: PrismaOrderState): OrderState {
  return s as unknown as OrderState;
}

function toActorId(actorId: string | null | undefined): string | undefined {
  return actorId ?? undefined;
}

// ── createPayPalOrder ──────────────────────────────────────────────────────────

/**
 * Create a PayPal AUTHORIZE order for the BASE payment on an AGREED order.
 * Returns {paypalOrderId, approveUrl} — the UI sends the customer to approveUrl.
 */
export async function createPayPalOrder(
  orderId: string,
  _actorId: string,
): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!canActorTransition(toDomainState(order.state), OrderState.AUTHORIZED, "CUSTOMER")) {
    throw new Error(`Cannot create PayPal order: order ${orderId} is in state ${order.state}`);
  }

  // Minimal totals shape for toPayPalAmount (discount already applied to totalCents)
  const totals = {
    baseCents: order.totalCents,
    rushCents: 0,
    shippingCents: 0,
    customsCents: 0,
    appliedDiscountBps: order.discountApplied ? order.discountBps : 0,
    discountCents: 0,
    totalCents: order.totalCents,
  };
  const amount = toPayPalAmount(totals);

  // Create a Payment row in PENDING state before calling PayPal
  const payment = await prisma.payment.create({
    data: {
      orderId,
      type: "BASE",
      amountCents: order.totalCents,
      status: "PENDING",
    },
  });

  // ── PayPal call (outside any transaction) ──
  const { paypalOrderId, approveUrl } = await createAuthorizeOrder({
    amount,
    orderId,
    paymentId: payment.id,
  });

  await prisma.payment.update({
    where: { id: payment.id },
    data: { paypalOrderId, lastPaypalStatus: "CREATED" },
  });

  return { paypalOrderId, approveUrl };
}

// ── authorizePayment ───────────────────────────────────────────────────────────

/**
 * Called after the customer approves the PayPal order.
 * Authorizes the hold with PayPal, then transitions Order → AUTHORIZED in one TX.
 *
 * PayPal is called BEFORE the transaction. If the DB write fails, the caller can
 * retry — PayPal will return the same authorization ID (idempotent for 6 h).
 */
export async function authorizePayment(
  orderId: string,
  paypalOrderId: string,
  actorId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!canActorTransition(toDomainState(order.state), OrderState.AUTHORIZED, "CUSTOMER")) {
    throw new Error(`Cannot authorize: order ${orderId} is in state ${order.state}`);
  }

  const payment = order.payments.find((p) => p.paypalOrderId === paypalOrderId);
  if (!payment) {
    throw new Error(`Payment with paypalOrderId ${paypalOrderId} not found on order ${orderId}`);
  }

  // ── PayPal call (outside transaction) ──
  const { authorizationId, status, expirationTime } = await authorizeOrder(
    paypalOrderId,
    payment.id,
  );

  const now = new Date();
  const authorizedAt = now;
  const honorUntil = new Date(authorizedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiresAt = expirationTime ? new Date(expirationTime) : null;

  // ── DB transaction: re-check state, write payment + order + event ──
  await prisma.$transaction(async (tx) => {
    // Re-read inside transaction to guard against concurrent state changes
    const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(freshOrder.state), OrderState.AUTHORIZED)) {
      throw new Error(`Order ${orderId} state changed before DB write; aborting`);
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        paypalAuthorizationId: authorizationId,
        status: "AUTHORIZED" as PaymentStatus,
        authorizedAt,
        honorUntil,
        expiresAt,
        lastPaypalStatus: status,
        authorizationHistory: [
          { authorizationId, status, authorizedAt: authorizedAt.toISOString() },
        ],
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: { state: "AUTHORIZED" },
    });

    await appendOrderEvent(tx, {
      orderId,
      fromState: freshOrder.state,
      toState: "AUTHORIZED",
      actorId,
      type: "PAYPAL_AUTHORIZED",
      payload: { authorizationId, paypalOrderId, paymentId: payment.id },
    });
  });
}

// ── captureAllLive ─────────────────────────────────────────────────────────────

/**
 * Capture all AUTHORIZED payments on a SHIPPED order.
 * Called after customer fit confirmation or by the cron auto-capture.
 * Transitions Order → RELEASED.
 */
export async function captureAllLive(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  const actor: Actor = actorId === "SYSTEM" ? "SYSTEM" : "CUSTOMER";
  if (!canActorTransition(toDomainState(order.state), OrderState.RELEASED, actor)) {
    throw new Error(`Cannot capture: order ${orderId} is in state ${order.state}`);
  }

  for (const payment of order.payments) {
    if (!payment.paypalAuthorizationId) continue;

    // ── PayPal call (outside transaction) ──
    const { captureId, status } = await captureAuthorization(payment.paypalAuthorizationId);
    const capturedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          paypalCaptureId: captureId,
          status: "CAPTURED" as PaymentStatus,
          capturedAt,
          lastPaypalStatus: status,
        },
      });

      await appendOrderEvent(tx, {
        orderId,
        fromState: order.state,
        toState: order.state,
        actorId: toActorId(actorId),
        type: "PAYPAL_CAPTURED",
        payload: {
          captureId,
          paymentId: payment.id,
          authorizationId: payment.paypalAuthorizationId,
        },
      });
    });
  }

  // Transition Order → RELEASED in a final transaction
  await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(freshOrder.state), OrderState.RELEASED)) {
      throw new Error(`Order ${orderId} state changed before RELEASED write; aborting`);
    }

    const fitConfirmedAt = actorId !== "SYSTEM" ? new Date() : undefined;

    await tx.order.update({
      where: { id: orderId },
      data: {
        state: "RELEASED",
        ...(fitConfirmedAt ? { fitConfirmedAt } : {}),
      },
    });

    await appendOrderEvent(tx, {
      orderId,
      fromState: freshOrder.state,
      toState: "RELEASED",
      actorId: toActorId(actorId),
      type: "STATE_CHANGE",
    });
  });
}

// ── voidAllLive ────────────────────────────────────────────────────────────────

/**
 * Void all AUTHORIZED payments on an order.
 * Transitions Order → VOIDED.
 */
export async function voidAllLive(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  if (!canActorTransition(toDomainState(order.state), OrderState.VOIDED, "CUSTOMER")) {
    throw new Error(`Cannot void: order ${orderId} is in state ${order.state}`);
  }

  for (const payment of order.payments) {
    if (!payment.paypalAuthorizationId) continue;

    // ── PayPal call (outside transaction) ──
    await voidAuthorization(payment.paypalAuthorizationId);
    const voidedAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "VOIDED" as PaymentStatus,
          voidedAt,
          lastPaypalStatus: "VOIDED",
        },
      });

      await appendOrderEvent(tx, {
        orderId,
        fromState: order.state,
        toState: order.state,
        actorId: toActorId(actorId),
        type: "PAYPAL_VOIDED",
        payload: {
          paymentId: payment.id,
          authorizationId: payment.paypalAuthorizationId,
        },
      });
    });
  }

  await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(freshOrder.state), OrderState.VOIDED)) {
      throw new Error(`Order ${orderId} state changed before VOIDED write; aborting`);
    }

    await tx.order.update({ where: { id: orderId }, data: { state: "VOIDED" } });

    await appendOrderEvent(tx, {
      orderId,
      fromState: freshOrder.state,
      toState: "VOIDED",
      actorId: toActorId(actorId),
      type: "STATE_CHANGE",
    });
  });
}

// ── reauthorizeDue ─────────────────────────────────────────────────────────────

/**
 * Find all AUTHORIZED payments past their honor period and reauthorize them.
 * Called by the cron endpoint. Non-fatal per payment — logs and continues.
 */
export async function reauthorizeDue(now: Date): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { status: "AUTHORIZED", paypalAuthorizationId: { not: null } },
  });

  let count = 0;
  for (const payment of payments) {
    if (!shouldReauthorize(payment, now)) continue;
    if (!payment.paypalAuthorizationId) continue;

    try {
      // ── PayPal call (outside transaction) ──
      const result = await reauthorizeAuthorization(payment.paypalAuthorizationId);
      const reauthorizedAt = now;
      const newHonorUntil = effectiveHonorPeriodEnd(
        payment.authorizedAt ?? now,
        reauthorizedAt,
      );

      await prisma.$transaction(async (tx) => {
        // Re-read inside TX: if another cron run already reauthorized, skip.
        const freshPayment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (freshPayment.reauthorizedAt !== null) return;

        const history = Array.isArray(freshPayment.authorizationHistory)
          ? (freshPayment.authorizationHistory as object[])
          : [];

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            paypalAuthorizationId: result.authorizationId,
            reauthorizedAt,
            honorUntil: newHonorUntil,
            expiresAt: result.expirationTime ? new Date(result.expirationTime) : undefined,
            lastPaypalStatus: result.status,
            authorizationHistory: [
              ...history,
              {
                authorizationId: result.authorizationId,
                status: result.status,
                reauthorizedAt: reauthorizedAt.toISOString(),
              },
            ],
          },
        });

        await appendOrderEvent(tx, {
          orderId: payment.orderId,
          fromState: undefined,
          toState: "AUTHORIZED" as PrismaOrderState,
          actorId: "SYSTEM",
          type: "PAYPAL_REAUTHORIZED",
          payload: {
            newAuthorizationId: result.authorizationId,
            previousAuthorizationId: payment.paypalAuthorizationId,
          },
        });
      });
      count++;
    } catch (err) {
      // Non-fatal: log and continue to next payment
      console.error(
        `reauthorizeDue: failed for payment ${payment.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return count;
}

// ── autoCaptureDue ─────────────────────────────────────────────────────────────

/**
 * Auto-capture SHIPPED orders meeting the silent-customer or day-28 emergency rule.
 * Called by the cron endpoint. Non-fatal per order.
 */
export async function autoCaptureDue(now: Date): Promise<number> {
  const orders = await prisma.order.findMany({
    where: { state: "SHIPPED" },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  let count = 0;
  for (const order of orders) {
    const triggeringPayment = order.payments.find((p) => shouldAutoCapture(order, p, now));
    if (!triggeringPayment) continue;

    const reason =
      triggeringPayment.authorizedAt &&
      now >= new Date(triggeringPayment.authorizedAt.getTime() + 28 * 24 * 60 * 60 * 1000)
        ? "day-28 emergency capture before authorization expiry"
        : "silent customer: 7-day fit window and day-25 cutoff passed";

    try {
      console.log(`autoCaptureDue: capturing order ${order.id} — ${reason}`);
      await captureAllLive(order.id, "SYSTEM");
      count++;
    } catch (err) {
      console.error(
        `autoCaptureDue: failed for order ${order.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return count;
}
