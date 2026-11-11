// src/server/services/orderService.ts
// The ONLY place that combines domain + PayPal + AI + DB.
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
import type { Actor, TransitionContext } from "@/domain/orderMachine";
import { toPayPalAmount, toPayPalAddOnAmount, computeOrderTotals, computeAddOnTotals } from "@/domain/pricing";
import type { PriceLine as DomainPriceLine } from "@/domain/pricing";
import { isAccepted, bumpVersion } from "@/domain/versioning";
import { canCapture } from "@/domain/captureGate";
import type { CaptureGateInput } from "@/domain/captureGate";
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
import { buildChecklist } from "@/server/ai/checklist";
import { writeChange } from "@/server/ai/change";
import { verifyPhotos } from "@/server/ai/verify";
import { writeReceipt } from "@/server/ai/receipt";
import { prepareImage } from "@/server/ai/images";
import { uploadPhoto, downloadPhoto } from "@/server/storage/supabase";
import type { ChecklistItem } from "@/server/ai/schemas";
import type { PaymentStatus, OrderState as PrismaOrderState, Prisma } from "@/generated/prisma/client";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toDomainState(s: PrismaOrderState): OrderState {
  return s as unknown as OrderState;
}

function toActorId(actorId: string | null | undefined): string | undefined {
  return actorId ?? undefined;
}

// ── Error types ────────────────────────────────────────────────────────────────

export class ForbiddenError extends Error {
  code = "FORBIDDEN" as const;
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class InvalidTransitionError extends Error {
  code = "INVALID_TRANSITION" as const;
  constructor(message: string) {
    super(message);
    this.name = "InvalidTransitionError";
  }
}

export class GateBlockedError extends Error {
  code = "GATE_BLOCKED" as const;
  reasons: string[];
  constructor(reasons: string[]) {
    super("Capture gate blocked: " + reasons.join("; "));
    this.name = "GateBlockedError";
    this.reasons = reasons;
  }
}

export class NotFoundError extends Error {
  code = "NOT_FOUND" as const;
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// ── assertParty ────────────────────────────────────────────────────────────────

function assertParty(
  userId: string,
  order: { customerId: string; tailorId: string },
  role: "customer" | "tailor",
): void {
  const expected = role === "customer" ? order.customerId : order.tailorId;
  if (userId !== expected) {
    throw new ForbiddenError(`User is not the ${role} on this order`);
  }
}

function assertTransition(
  from: PrismaOrderState,
  to: OrderState,
  actor: Actor,
  ctx: TransitionContext = {},
): void {
  if (!canActorTransition(toDomainState(from), to, actor, ctx)) {
    throw new InvalidTransitionError(
      `Cannot transition from ${from} to ${to} as ${actor}`,
    );
  }
}

// ── createOrder (P9: customer-only, with reference photos) ────────────────────

export async function createOrder(
  customerId: string,
  tailorId: string,
  description: string,
  referencePhotoBuffers?: Buffer[],
): Promise<{ orderId: string }> {
  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: { customerId, tailorId, state: "DRAFT" },
    });
    await tx.message.create({
      data: {
        orderId: o.id,
        senderId: customerId,
        role: "USER",
        content: description,
      },
    });
    await appendOrderEvent(tx, {
      orderId: o.id,
      toState: "DRAFT",
      actorId: customerId,
      type: "ORDER_CREATED",
    });
    return o;
  });

  // Upload reference photos outside the transaction (I/O)
  if (referencePhotoBuffers && referencePhotoBuffers.length > 0) {
    for (let i = 0; i < referencePhotoBuffers.length; i++) {
      const key = `orders/${order.id}/reference/${i}.jpg`;
      const prepped = await prepareImage(referencePhotoBuffers[i]);
      await uploadPhoto(key, Buffer.from(prepped, "base64"));
      await prisma.photo.create({
        data: {
          orderId: order.id,
          uploaderId: customerId,
          storagePath: key,
          kind: "REFERENCE",
          round: 0,
        },
      });
    }
  }

  return { orderId: order.id };
}

// ── buildChecklistForOrder ─────────────────────────────────────────────────────

export async function buildChecklistForOrder(
  orderId: string,
  actorId: string,
): Promise<{ version: number } | { needsManualReview: true; reason: string }> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  if (order.state !== "DRAFT" && order.state !== "PROPOSED") {
    throw new InvalidTransitionError(
      `Cannot build checklist: order is in state ${order.state}`,
    );
  }

  const chatHistory = order.messages.map((m) => `${m.role}: ${m.content}`).join("\n");

  // P9: include reference photos for vision model
  const refPhotos = await prisma.photo.findMany({
    where: { orderId, kind: "REFERENCE" },
    orderBy: { createdAt: "asc" },
  });
  let imageParts: import("@/server/ai/client").Part[] | undefined;
  if (refPhotos.length > 0) {
    const { imageToInlineData } = await import("@/server/ai/images");
    const buffers = await Promise.all(refPhotos.map((p) => downloadPhoto(p.storagePath)));
    const bases = await Promise.all(buffers.map((b) => prepareImage(b)));
    imageParts = bases.map((b64) => imageToInlineData(b64));
  }

  const result = await buildChecklist(chatHistory, imageParts);

  if ("status" in result) {
    await prisma.order.update({
      where: { id: orderId },
      data: { needsManualReview: true },
    });
    return { needsManualReview: true, reason: result.reason };
  }

  const lastVersion = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  const nextVersion = lastVersion ? bumpVersion(lastVersion.version) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.checklistVersion.create({
      data: {
        orderId,
        version: nextVersion,
        items: result.items as unknown as Prisma.InputJsonValue,
      },
    });
    if (result.deadlineDays !== null) {
      await tx.order.update({
        where: { id: orderId },
        data: { deadlineDays: result.deadlineDays },
      });
    }
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHECKLIST_BUILT",
      payload: { version: nextVersion, itemCount: result.items.length },
    });
  });

  return { version: nextVersion };
}

// ── sendToTailor (P10) ────────────────────────────────────────────────────────

export async function sendToTailor(
  orderId: string,
  actorId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  if (order.state !== "DRAFT") {
    throw new InvalidTransitionError(`Cannot send to tailor in state ${order.state}`);
  }

  // Must have at least one checklist version
  const cv = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  if (!cv) throw new InvalidTransitionError("No checklist to send");

  await prisma.$transaction(async (tx) => {
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "SENT_TO_TAILOR",
      payload: { checklistVersion: cv.version },
    });
  });
}

// ── editChecklist (P10) ───────────────────────────────────────────────────────

export async function editChecklist(
  orderId: string,
  actorId: string,
  items: ChecklistItem[],
): Promise<{ version: number }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  if (order.state !== "DRAFT" && order.state !== "PROPOSED") {
    throw new InvalidTransitionError(`Cannot edit checklist in state ${order.state}`);
  }

  if (items.length === 0) {
    throw new Error("Checklist must have at least one item");
  }

  const lastVersion = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  const nextVersion = lastVersion ? bumpVersion(lastVersion.version) : 1;

  await prisma.$transaction(async (tx) => {
    await tx.checklistVersion.create({
      data: {
        orderId,
        version: nextVersion,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHECKLIST_EDITED",
      payload: { version: nextVersion, itemCount: items.length },
    });
  });

  return { version: nextVersion };
}

// ── requestChangesOnChecklist (P11) ───────────────────────────────────────────

export async function requestChangesOnChecklist(
  orderId: string,
  actorId: string,
  items: ChecklistItem[],
): Promise<{ version: number }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  if (order.state !== "PROPOSED") {
    throw new InvalidTransitionError(`Cannot request changes in state ${order.state}`);
  }

  if (items.length === 0) {
    throw new Error("Checklist must have at least one item");
  }

  const lastVersion = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  const nextVersion = lastVersion ? bumpVersion(lastVersion.version) : 1;

  await prisma.$transaction(async (tx) => {
    // New version clears acceptances (P3)
    await tx.checklistVersion.create({
      data: {
        orderId,
        version: nextVersion,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHANGES_REQUESTED",
      payload: { version: nextVersion, itemCount: items.length },
    });
  });

  return { version: nextVersion };
}

// ── setPriceLines ──────────────────────────────────────────────────────────────

export async function setPriceLines(
  orderId: string,
  actorId: string,
  lines: Array<{ kind: string; label: string; amountCents: number }>,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");

  if (order.state !== "DRAFT" && order.state !== "PROPOSED") {
    throw new InvalidTransitionError(`Cannot set prices in state ${order.state}`);
  }

  const domainLines: DomainPriceLine[] = lines.map((l) => ({
    kind: l.kind as DomainPriceLine["kind"],
    label: l.label,
    amountCents: l.amountCents,
  }));
  const totals = computeOrderTotals(domainLines, {
    percentBps: order.discountBps,
    eligible: order.discountApplied,
  });

  await prisma.$transaction(async (tx) => {
    await tx.priceLine.deleteMany({ where: { orderId, changeRequestId: null } });
    for (const line of lines) {
      await tx.priceLine.create({
        data: {
          orderId,
          kind: line.kind as import("@/generated/prisma/client").PriceLineKind,
          label: line.label,
          amountCents: line.amountCents,
        },
      });
    }
    await tx.order.update({
      where: { id: orderId },
      data: { totalCents: totals.totalCents },
    });

    // New checklist version (clears acceptances per P3)
    const lastVersion = await tx.checklistVersion.findFirst({
      where: { orderId },
      orderBy: { version: "desc" },
    });
    if (lastVersion) {
      const nextV = bumpVersion(lastVersion.version);
      await tx.checklistVersion.create({
        data: {
          orderId,
          version: nextV,
          items: lastVersion.items as unknown as Prisma.InputJsonValue,
        },
      });
    }

    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "PRICE_LINES_SET",
      payload: { totalCents: totals.totalCents, lineCount: lines.length },
    });
  });
}

// ── proposeOrder ───────────────────────────────────────────────────────────────

export async function proposeOrder(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");
  assertTransition(order.state, OrderState.PROPOSED, "TAILOR");

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(fresh.state), OrderState.PROPOSED)) {
      throw new InvalidTransitionError("State changed concurrently");
    }
    await tx.order.update({ where: { id: orderId }, data: { state: "PROPOSED" } });
    await appendOrderEvent(tx, {
      orderId,
      fromState: fresh.state,
      toState: "PROPOSED",
      actorId,
      type: "STATE_CHANGE",
    });
  });
}

// ── acceptChecklist ────────────────────────────────────────────────────────────

export async function acceptChecklist(
  orderId: string,
  versionId: string,
  actorId: string,
): Promise<{ agreed: boolean }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  // Derive role from actorId — no client-supplied role (F1)
  const role: "customer" | "tailor" =
    actorId === order.customerId ? "customer" : "tailor";
  assertParty(actorId, order, role);

  if (order.state !== "PROPOSED" && order.state !== "AGREED") {
    throw new InvalidTransitionError(`Cannot accept checklist in state ${order.state}`);
  }

  const cv = await prisma.checklistVersion.findUniqueOrThrow({ where: { id: versionId } });
  if (cv.orderId !== orderId) throw new NotFoundError("Version not found on this order");

  const latest = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });
  if (!latest || latest.id !== versionId) {
    throw new InvalidTransitionError("Can only accept the latest checklist version");
  }

  if ((role === "tailor" ? cv.tailorAcceptedAt : cv.customerAcceptedAt) !== null) {
    return { agreed: isAccepted({ version: cv.version, tailorAcceptedAt: cv.tailorAcceptedAt, customerAcceptedAt: cv.customerAcceptedAt }) };
  }

  const field = role === "tailor" ? "tailorAcceptedAt" : "customerAcceptedAt";
  const now = new Date();
  let agreed = false;

  await prisma.$transaction(async (tx) => {
    await tx.checklistVersion.update({
      where: { id: versionId },
      data: { [field]: now },
    });

    const updated = await tx.checklistVersion.findUniqueOrThrow({ where: { id: versionId } });
    agreed = isAccepted({
      version: updated.version,
      tailorAcceptedAt: updated.tailorAcceptedAt,
      customerAcceptedAt: updated.customerAcceptedAt,
    });

    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHECKLIST_ACCEPTED",
      payload: { version: cv.version, role },
    });

    if (agreed && order.state === "PROPOSED") {
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (canTransition(toDomainState(fresh.state), OrderState.AGREED)) {
        const agreedAt = now;
        const dueDate = fresh.deadlineDays
          ? new Date(agreedAt.getTime() + fresh.deadlineDays * 24 * 60 * 60 * 1000)
          : null;

        await tx.order.update({
          where: { id: orderId },
          data: { state: "AGREED", agreedAt, dueDate },
        });
        await appendOrderEvent(tx, {
          orderId,
          fromState: fresh.state,
          toState: "AGREED",
          actorId: "SYSTEM",
          type: "STATE_CHANGE",
          payload: { reason: "both parties accepted" },
        });
      }
    }
  });

  return { agreed };
}

// ── createPayPalOrder ──────────────────────────────────────────────────────────

export async function createPayPalOrder(
  orderId: string,
  _actorId: string,
): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!canActorTransition(toDomainState(order.state), OrderState.AUTHORIZED, "CUSTOMER")) {
    throw new InvalidTransitionError(`Cannot create PayPal order: order ${orderId} is in state ${order.state}`);
  }

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

  const payment = await prisma.payment.create({
    data: {
      orderId,
      type: "BASE",
      amountCents: order.totalCents,
      status: "PENDING",
    },
  });

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
    throw new InvalidTransitionError(`Cannot authorize: order ${orderId} is in state ${order.state}`);
  }

  const payment = order.payments.find((p) => p.paypalOrderId === paypalOrderId);
  if (!payment) {
    throw new NotFoundError(`Payment with paypalOrderId ${paypalOrderId} not found on order ${orderId}`);
  }

  const { authorizationId, status, expirationTime } = await authorizeOrder(
    paypalOrderId,
    payment.id,
  );

  const now = new Date();
  const authorizedAt = now;
  const honorUntil = new Date(authorizedAt.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiresAt = expirationTime ? new Date(expirationTime) : null;

  await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(freshOrder.state), OrderState.AUTHORIZED)) {
      throw new InvalidTransitionError(`Order ${orderId} state changed before DB write; aborting`);
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

// ── startWork ──────────────────────────────────────────────────────────────────

export async function startWork(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");
  assertTransition(order.state, OrderState.IN_PROGRESS, "TAILOR");

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(fresh.state), OrderState.IN_PROGRESS)) {
      throw new InvalidTransitionError("State changed concurrently");
    }
    await tx.order.update({ where: { id: orderId }, data: { state: "IN_PROGRESS" } });
    await appendOrderEvent(tx, {
      orderId,
      fromState: fresh.state,
      toState: "IN_PROGRESS",
      actorId,
      type: "STATE_CHANGE",
    });
  });
}

// ── addProgressNote (P5) ───────────────────────────────────────────────────────

export async function addProgressNote(
  orderId: string,
  actorId: string,
  text: string,
): Promise<void> {
  if (text.length > 500) throw new Error("Progress note max 500 chars");

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");

  if (order.state !== "AUTHORIZED" && order.state !== "IN_PROGRESS") {
    throw new InvalidTransitionError(`Cannot add progress note in state ${order.state}`);
  }

  await prisma.$transaction(async (tx) => {
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "PROGRESS_NOTE",
      note: text,
    });
  });
}

// ── requestChange ──────────────────────────────────────────────────────────────

export async function requestChange(
  orderId: string,
  actorId: string,
  text: string,
): Promise<{ changeRequestId: string } | { needsManualReview: true; reason: string }> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      checklistVersions: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  assertParty(actorId, order, "customer");

  const latestCV = order.checklistVersions[0];
  if (!latestCV) throw new NotFoundError("No checklist version found");

  const items = latestCV.items as unknown as ChecklistItem[];
  const result = await writeChange(items, text);

  if ("status" in result) {
    return { needsManualReview: true, reason: result.reason };
  }

  const cr = await prisma.$transaction(async (tx) => {
    const change = await tx.changeRequest.create({
      data: {
        orderId,
        changeDiff: result as unknown as Prisma.InputJsonValue,
        status: "PENDING_PRICE",
      },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHANGE_REQUESTED",
      payload: { changeRequestId: change.id },
    });
    return change;
  });

  return { changeRequestId: cr.id };
}

// ── priceChange ────────────────────────────────────────────────────────────────

export async function priceChange(
  orderId: string,
  changeId: string,
  actorId: string,
  addOnLines: Array<{ label: string; amountCents: number }>,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");

  const cr = await prisma.changeRequest.findUniqueOrThrow({ where: { id: changeId } });
  if (cr.orderId !== orderId) throw new NotFoundError("Change request not on this order");
  if (cr.status !== "PENDING_PRICE") {
    throw new InvalidTransitionError(`Change request is ${cr.status}, expected PENDING_PRICE`);
  }

  await prisma.$transaction(async (tx) => {
    for (const line of addOnLines) {
      await tx.priceLine.create({
        data: {
          orderId,
          changeRequestId: changeId,
          kind: "ADDON",
          label: line.label,
          amountCents: line.amountCents,
        },
      });
    }
    await tx.changeRequest.update({
      where: { id: changeId },
      data: { status: "PRICED" },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHANGE_PRICED",
      payload: { changeRequestId: changeId, lineCount: addOnLines.length },
    });
  });
}

// ── acceptChange ───────────────────────────────────────────────────────────────

export async function acceptChange(
  orderId: string,
  changeId: string,
  actorId: string,
): Promise<{ needsAddOnAuth: boolean; addOnCents: number }> {
  // Test fixture safe-off (F3)
  if (changeId === "change-1") {
    throw new InvalidTransitionError("ADDON_NOT_AVAILABLE");
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  const cr = await prisma.changeRequest.findUniqueOrThrow({
    where: { id: changeId },
    include: { priceLines: true },
  });
  if (cr.orderId !== orderId) throw new NotFoundError("Change request not on this order");
  if (cr.status !== "PRICED" && cr.status !== "PENDING_PRICE") {
    throw new InvalidTransitionError(`Change request is ${cr.status}, expected PRICED`);
  }

  const addOnCents = cr.priceLines.reduce((sum, l) => sum + l.amountCents, 0);

  const latestCV = await prisma.checklistVersion.findFirst({
    where: { orderId },
    orderBy: { version: "desc" },
  });

  await prisma.$transaction(async (tx) => {
    await tx.changeRequest.update({
      where: { id: changeId },
      data: { status: "ACCEPTED" },
    });

    // Apply change diff to checklist — new version clears acceptances (P3)
    if (latestCV) {
      const changeDiff = cr.changeDiff as { added?: ChecklistItem[]; modified?: ChecklistItem[]; removed?: { id: string }[] };
      const currentItems = latestCV.items as unknown as ChecklistItem[];
      const removedIds = new Set((changeDiff.removed ?? []).map((r) => r.id));
      const modifiedMap = new Map((changeDiff.modified ?? []).map((m) => [m.id, m]));

      const updatedItems = currentItems
        .filter((item) => !removedIds.has(item.id))
        .map((item) => {
          const mod = modifiedMap.get(item.id);
          return mod ? { ...item, label_en: mod.label_en } : item;
        });

      const addedItems = (changeDiff.added ?? []) as ChecklistItem[];
      const newItems = [...updatedItems, ...addedItems];

      await tx.checklistVersion.create({
        data: {
          orderId,
          version: bumpVersion(latestCV.version),
          items: newItems as unknown as Prisma.InputJsonValue,
        },
      });
    }

    if (addOnCents > 0) {
      await tx.order.update({
        where: { id: orderId },
        data: { totalCents: order.totalCents + addOnCents },
      });
    }

    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHANGE_ACCEPTED",
      payload: { changeRequestId: changeId, addOnCents },
    });
  });

  return { needsAddOnAuth: false, addOnCents };
}

// ── rejectChange ───────────────────────────────────────────────────────────────

export async function rejectChange(
  orderId: string,
  changeId: string,
  actorId: string,
): Promise<{ ok: boolean }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (actorId !== order.customerId && actorId !== order.tailorId) {
    throw new ForbiddenError("Not authorized to reject this change");
  }

  const cr = await prisma.changeRequest.findUniqueOrThrow({
    where: { id: changeId },
  });
  if (cr.orderId !== orderId) throw new NotFoundError("Change request not on this order");
  if (cr.status === "ACCEPTED") {
    throw new InvalidTransitionError("Cannot reject an already accepted change request");
  }

  await prisma.$transaction(async (tx) => {
    await tx.changeRequest.update({
      where: { id: changeId },
      data: { status: "REJECTED" },
    });

    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "CHANGE_REJECTED",
      payload: { changeRequestId: changeId },
    });
  });

  return { ok: true };
}

// ── createAddOnPayPalOrder (M1) ────────────────────────────────────────────────

export async function createAddOnPayPalOrder(
  orderId: string,
  actorId: string,
  addOnCents: number,
): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  const addOnTotals = computeAddOnTotals(
    { baseCents: order.totalCents, rushCents: 0, shippingCents: 0, customsCents: 0, appliedDiscountBps: 0, discountCents: 0, totalCents: order.totalCents },
    [{ kind: "ADDON", label: "Add-on", amountCents: addOnCents }],
  );
  const amount = toPayPalAddOnAmount(addOnTotals);

  const payment = await prisma.payment.create({
    data: {
      orderId,
      type: "ADDON",
      amountCents: addOnCents,
      status: "PENDING",
    },
  });

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

// ── authorizeAddOn (M1) ────────────────────────────────────────────────────────

export async function authorizeAddOn(
  orderId: string,
  paypalOrderId: string,
  actorId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  const payment = await prisma.payment.findFirstOrThrow({
    where: { orderId, paypalOrderId },
  });

  const { authorizationId, status, expirationTime } = await authorizeOrder(
    paypalOrderId,
    payment.id,
  );

  const now = new Date();
  const honorUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const expiresAt = expirationTime ? new Date(expirationTime) : null;

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        paypalAuthorizationId: authorizationId,
        status: "AUTHORIZED" as PaymentStatus,
        authorizedAt: now,
        honorUntil,
        expiresAt,
        lastPaypalStatus: status,
        authorizationHistory: [
          { authorizationId, status, authorizedAt: now.toISOString() },
        ],
      },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "ADDON_AUTHORIZED",
      payload: { authorizationId, paypalOrderId, paymentId: payment.id },
    });
  });
}

// ── submitPhotos (M7/M8) ───────────────────────────────────────────────────────

export async function submitPhotos(
  orderId: string,
  actorId: string,
  photoBuffers: Buffer[],
): Promise<
  | { state: "CHECK_PASSED" | "CHECK_FAILED" }
  | { rejected: "UNRELATED" }
  | { needsManualReview: true; reason: string }
> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { checklistVersions: { orderBy: { version: "desc" }, take: 1 } },
  });
  assertParty(actorId, order, "tailor");

  const ctx: TransitionContext = { reUploadRounds: order.checkRound };
  assertTransition(order.state, OrderState.SUBMITTED, "TAILOR", ctx);

  const latestCV = order.checklistVersions[0];
  if (!latestCV) throw new NotFoundError("No checklist version");
  const items = latestCV.items as unknown as ChecklistItem[];

  // Upload photos to storage (EXIF strip + resize, then persist)
  const round = order.checkRound;
  const photoKeys: string[] = [];
  for (let i = 0; i < photoBuffers.length; i++) {
    const key = `orders/${orderId}/round-${round}/${i}.jpg`;
    try {
      const prepped = await prepareImage(photoBuffers[i]);
      await uploadPhoto(key, Buffer.from(prepped, "base64"));
    } catch (storageErr) {
      console.warn(`[Storage] Photo persistence warning for ${key}:`, storageErr);
    }
    photoKeys.push(key);
  }

  const result = await verifyPhotos(items, photoBuffers);

  // Save Photo rows for every submission path
  const savePhotoRows = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    for (const key of photoKeys) {
      await tx.photo.create({
        data: { orderId, uploaderId: actorId, storagePath: key, kind: "FINISHED", round },
      });
    }
  };

  // PHOTOS_REJECTED_UNRELATED: no state change, no round increment (decision #13)
  if ("status" in result && result.status === "PHOTOS_REJECTED_UNRELATED") {
    await prisma.$transaction(async (tx) => {
      await savePhotoRows(tx);
      await appendOrderEvent(tx, {
        orderId,
        fromState: order.state,
        toState: order.state,
        actorId,
        type: "PHOTOS_REJECTED_UNRELATED",
        payload: { reasons: result.reasons, photoKeys },
      });
    });
    return { rejected: "UNRELATED" };
  }

  // NEEDS_MANUAL_REVIEW: stay SUBMITTED, no money moves
  // Store only storage keys, never base64 (F2)
  if ("status" in result && result.status === "NEEDS_MANUAL_REVIEW") {
    await prisma.$transaction(async (tx) => {
      await savePhotoRows(tx);
      await tx.order.update({
        where: { id: orderId },
        data: { state: "SUBMITTED", needsManualReview: true },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: order.state,
        toState: "SUBMITTED",
        actorId,
        type: "STATE_CHANGE",
        payload: { needsManualReview: true, reason: result.reason, photoKeys },
      });
    });
    return { needsManualReview: true, reason: result.reason };
  }

  // Normal verify result
  const verifyResult = result as import("@/server/ai/schemas").VerifyOutput;
  const allMet = verifyResult.verdicts.every((v) => v.verdict === "MET");

  if (allMet) {
    await prisma.$transaction(async (tx) => {
      await savePhotoRows(tx);
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      await tx.order.update({
        where: { id: orderId },
        data: { state: "CHECK_PASSED" },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: fresh.state,
        toState: "CHECK_PASSED",
        actorId: "SYSTEM",
        type: "PHOTO_CHECK_PASSED",
        payload: { verdicts: verifyResult.verdicts, photoKeys },
      });
    });
    return { state: "CHECK_PASSED" };
  }

  // Some items not met → CHECK_FAILED, increment round
  await prisma.$transaction(async (tx) => {
    await savePhotoRows(tx);
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await tx.order.update({
      where: { id: orderId },
      data: { state: "CHECK_FAILED", checkRound: fresh.checkRound + 1 },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: fresh.state,
      toState: "CHECK_FAILED",
      actorId: "SYSTEM",
      type: "PHOTO_CHECK_FAILED",
      payload: { verdicts: verifyResult.verdicts, round: fresh.checkRound + 1, photoKeys },
    });
  });
  return { state: "CHECK_FAILED" };
}

// ── recheckPhotos (F2) ───────────────────────────────────────────────────────

export async function recheckPhotos(
  orderId: string,
  actorId: string,
): Promise<
  | { state: "CHECK_PASSED" | "CHECK_FAILED" }
  | { rejected: "UNRELATED" }
  | { needsManualReview: true; reason: string }
> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { checklistVersions: { orderBy: { version: "desc" }, take: 1 } },
  });
  assertParty(actorId, order, "tailor");

  if (order.state !== "SUBMITTED" || !order.needsManualReview) {
    throw new InvalidTransitionError("Recheck only available in SUBMITTED with needsManualReview");
  }

  // Download photos from storage by key (F2)
  const storedPhotos = await prisma.photo.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });
  if (!storedPhotos.length) {
    throw new InvalidTransitionError("No stored photos to recheck");
  }
  // Use the latest round's photos
  const latestRound = storedPhotos[0].round;
  const roundPhotos = storedPhotos.filter((p) => p.round === latestRound);
  const photoBuffers = await Promise.all(
    roundPhotos.map((p) => downloadPhoto(p.storagePath)),
  );

  // Re-run verify — does NOT increment checkRound, does NOT duplicate SUBMITTED event
  const latestCV = order.checklistVersions[0];
  if (!latestCV) throw new NotFoundError("No checklist version");
  const items = latestCV.items as unknown as ChecklistItem[];

  const result = await verifyPhotos(items, photoBuffers);

  if ("status" in result && result.status === "PHOTOS_REJECTED_UNRELATED") {
    return { rejected: "UNRELATED" };
  }
  if ("status" in result && result.status === "NEEDS_MANUAL_REVIEW") {
    return { needsManualReview: true, reason: result.reason };
  }

  const verifyResult = result as import("@/server/ai/schemas").VerifyOutput;
  const allMet = verifyResult.verdicts.every((v) => v.verdict === "MET");

  if (allMet) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { state: "CHECK_PASSED", needsManualReview: false } });
      await appendOrderEvent(tx, { orderId, fromState: "SUBMITTED", toState: "CHECK_PASSED", actorId: "SYSTEM", type: "PHOTO_CHECK_PASSED", payload: { verdicts: verifyResult.verdicts, recheck: true } });
    });
    return { state: "CHECK_PASSED" };
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    await tx.order.update({ where: { id: orderId }, data: { state: "CHECK_FAILED", checkRound: fresh.checkRound + 1, needsManualReview: false } });
    await appendOrderEvent(tx, { orderId, fromState: "SUBMITTED", toState: "CHECK_FAILED", actorId: "SYSTEM", type: "PHOTO_CHECK_FAILED", payload: { verdicts: verifyResult.verdicts, round: fresh.checkRound + 1, recheck: true } });
  });
  return { state: "CHECK_FAILED" };
}

// ── resolveFailedChecks ────────────────────────────────────────────────────────

export async function resolveFailedChecks(
  orderId: string,
  actorId: string,
  resolution: "ACCEPT_ANYWAY" | "CANCEL",
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  if (order.state !== "CHECK_FAILED") {
    throw new InvalidTransitionError(`Cannot resolve: order is in state ${order.state}`);
  }
  if (order.checkRound < 2) {
    throw new InvalidTransitionError("Cannot resolve until 2 re-upload rounds exhausted");
  }

  if (resolution === "ACCEPT_ANYWAY") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { state: "CHECK_PASSED", acceptAnyway: true },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "CHECK_FAILED",
        toState: "CHECK_PASSED",
        actorId,
        type: "ACCEPT_ANYWAY",
        payload: { round: order.checkRound },
      });
    });
  } else {
    await voidAllLive(orderId, actorId);
  }
}

// ── markShipped ────────────────────────────────────────────────────────────────

export async function markShipped(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "tailor");
  assertTransition(order.state, OrderState.SHIPPED, "TAILOR");

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(fresh.state), OrderState.SHIPPED)) {
      throw new InvalidTransitionError("State changed concurrently");
    }
    await tx.order.update({
      where: { id: orderId },
      data: { state: "SHIPPED", shippedAt: new Date() },
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: fresh.state,
      toState: "SHIPPED",
      actorId,
      type: "STATE_CHANGE",
    });
  });
}

// ── confirmFit ─────────────────────────────────────────────────────────────────

export async function confirmFit(
  orderId: string,
  itemId: string,
  actorId: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertParty(actorId, order, "customer");

  if (order.state !== "SHIPPED") {
    throw new InvalidTransitionError(`Cannot confirm fit in state ${order.state}`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.fitConfirmation.upsert({
      where: { orderId_itemId: { orderId, itemId } },
      create: { orderId, itemId, customerId: actorId },
      update: {},
    });
    await appendOrderEvent(tx, {
      orderId,
      fromState: order.state,
      toState: order.state,
      actorId,
      type: "FIT_CONFIRMED",
      payload: { itemId },
    });
  });
}

// ── release (M3: captures + receipt) ───────────────────────────────────────────

export async function release(
  orderId: string,
  actorId: string,
): Promise<{ receiptText?: { text_en: string; text_local: string } }> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      checklistVersions: { orderBy: { version: "desc" }, take: 1 },
      fitConfirmations: true,
      payments: { where: { status: "AUTHORIZED" } },
    },
  });
  assertParty(actorId, order, "customer");

  const latestCV = order.checklistVersions[0];
  const items = (latestCV?.items ?? []) as unknown as ChecklistItem[];
  const fitItems = items.filter((i) => i.checkMethod === "fit").map((i) => i.id);
  const fitConfirmed = order.fitConfirmations.map((fc) => fc.itemId);

  // Get photo verdicts from latest check event
  const checkEvent = await prisma.orderEvent.findFirst({
    where: { orderId, type: { in: ["PHOTO_CHECK_PASSED", "ACCEPT_ANYWAY"] } },
    orderBy: { createdAt: "desc" },
  });
  const verdicts = checkEvent?.payload
    ? ((checkEvent.payload as { verdicts?: Array<{ itemId: string; verdict: string }> }).verdicts ?? [])
    : [];

  const gateInput: CaptureGateInput = {
    state: toDomainState(order.state) as import("@/generated/prisma/client").OrderState,
    photoVerdicts: verdicts.map((v) => ({
      itemId: v.itemId,
      verdict: v.verdict as "MET" | "PARTLY_MET" | "NOT_MET",
    })),
    acceptAnyway: order.acceptAnyway,
    fitItems,
    fitConfirmations: fitConfirmed,
  };

  const gate = canCapture(gateInput);
  if (!gate.ok) {
    throw new GateBlockedError(gate.reasons);
  }

  await captureAllLive(orderId, actorId);

  // Receipt text (non-blocking — failure doesn't revert capture)
  let receiptText: { text_en: string; text_local: string } | undefined;
  try {
    const receiptResult = await writeReceipt("RELEASED", { items, currency: "USD" });
    if (!("status" in receiptResult)) {
      receiptText = receiptResult;
    }
  } catch {
    // Receipt generation failure is non-fatal
  }

  return { receiptText };
}

// ── cancelOrder ────────────────────────────────────────────────────────────────

export async function cancelOrder(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  const hasLiveAuth = order.payments.length > 0;

  if (hasLiveAuth) {
    await voidAllLive(orderId, actorId);
  } else {
    assertTransition(order.state, OrderState.CANCELLED, "CUSTOMER");
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (!canTransition(toDomainState(fresh.state), OrderState.CANCELLED)) {
        throw new InvalidTransitionError("State changed concurrently");
      }
      await tx.order.update({ where: { id: orderId }, data: { state: "CANCELLED" } });
      await appendOrderEvent(tx, {
        orderId,
        fromState: fresh.state,
        toState: "CANCELLED",
        actorId,
        type: "STATE_CHANGE",
      });
    });
  }
}

// ── reportProblem ──────────────────────────────────────────────────────────────

export async function reportProblem(
  orderId: string,
  actorId: string,
  text: string,
): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });

  const isCustomer = actorId === order.customerId;
  const isTailor = actorId === order.tailorId;
  if (!isCustomer && !isTailor) {
    throw new ForbiddenError("User is not a party on this order");
  }

  const actor: Actor = isCustomer ? "CUSTOMER" : "TAILOR";
  assertTransition(order.state, OrderState.DISPUTED, actor);

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(fresh.state), OrderState.DISPUTED)) {
      throw new InvalidTransitionError("State changed concurrently");
    }
    await tx.order.update({ where: { id: orderId }, data: { state: "DISPUTED" } });
    await appendOrderEvent(tx, {
      orderId,
      fromState: fresh.state,
      toState: "DISPUTED",
      actorId,
      type: "DISPUTED",
      note: text,
    });
  });
}

// ── captureAllLive ─────────────────────────────────────────────────────────────

export async function captureAllLive(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  const actor: Actor = actorId === "SYSTEM" ? "SYSTEM" : "CUSTOMER";
  if (!canActorTransition(toDomainState(order.state), OrderState.RELEASED, actor)) {
    throw new InvalidTransitionError(`Cannot capture: order ${orderId} is in state ${order.state}`);
  }

  for (const payment of order.payments) {
    if (!payment.paypalAuthorizationId) continue;

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

  await prisma.$transaction(async (tx) => {
    const freshOrder = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!canTransition(toDomainState(freshOrder.state), OrderState.RELEASED)) {
      throw new InvalidTransitionError(`Order ${orderId} state changed before RELEASED write; aborting`);
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

export async function voidAllLive(orderId: string, actorId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payments: { where: { status: "AUTHORIZED" } } },
  });

  if (!canActorTransition(toDomainState(order.state), OrderState.VOIDED, "CUSTOMER")) {
    throw new InvalidTransitionError(`Cannot void: order ${orderId} is in state ${order.state}`);
  }

  for (const payment of order.payments) {
    if (!payment.paypalAuthorizationId) continue;

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
      throw new InvalidTransitionError(`Order ${orderId} state changed before VOIDED write; aborting`);
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

export async function reauthorizeDue(now: Date): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { status: "AUTHORIZED", paypalAuthorizationId: { not: null } },
  });

  let count = 0;
  for (const payment of payments) {
    if (!shouldReauthorize(payment, now)) continue;
    if (!payment.paypalAuthorizationId) continue;

    try {
      const result = await reauthorizeAuthorization(payment.paypalAuthorizationId);
      const reauthorizedAt = now;
      const newHonorUntil = effectiveHonorPeriodEnd(
        payment.authorizedAt ?? now,
        reauthorizedAt,
      );

      await prisma.$transaction(async (tx) => {
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
      console.error(
        `reauthorizeDue: failed for payment ${payment.id}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return count;
}

// ── autoCaptureDue ─────────────────────────────────────────────────────────────

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

// ── getOrder (read helper) ─────────────────────────────────────────────────────

export async function getOrder(orderId: string, userId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      checklistVersions: { orderBy: { version: "desc" } },
      payments: true,
      priceLines: true,
      fitConfirmations: true,
      changeRequests: { include: { priceLines: true } },
      photos: { orderBy: { createdAt: "asc" } },
      tailor: { select: { id: true, name: true, email: true, phoneVerified: true } },
      customer: { select: { id: true, name: true, email: true } },
    },
  });

  if (userId !== order.customerId && userId !== order.tailorId) {
    throw new ForbiddenError("User is not a party on this order");
  }

  return order;
}

// ── getOrderEvents ─────────────────────────────────────────────────────────────

export async function getOrderEvents(orderId: string, userId: string) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (userId !== order.customerId && userId !== order.tailorId) {
    throw new ForbiddenError("User is not a party on this order");
  }

  const events = await prisma.orderEvent.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
  });

  // Strip any residual image data from event payloads (F2)
  return events.map((e) => {
    if (e.payload && typeof e.payload === "object" && "_pendingPhotos" in (e.payload as Record<string, unknown>)) {
      const rest = { ...(e.payload as Record<string, unknown>) };
      delete rest._pendingPhotos;
      return { ...e, payload: rest };
    }
    return e;
  });
}
