export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db";
import { appendOrderEvent } from "@/server/events";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: orderId } = await ctx.params;
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      checklistVersions: { orderBy: { version: "desc" }, take: 1 },
      priceLines: true,
      payments: true,
    },
  });

  const now = new Date();

  // 1. DRAFT -> PROPOSED (Tailor sets pricing and proposes)
  if (order.state === "DRAFT") {
    await prisma.$transaction(async (tx) => {
      if (order.priceLines.length === 0) {
        await tx.priceLine.createMany({
          data: [
            { orderId, kind: "BASE", label: "Custom Tailoring & Stitching", amountCents: 6500 },
            { orderId, kind: "SHIPPING", label: "Standard Insured Shipping", amountCents: 1500 },
          ],
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { state: "PROPOSED", totalCents: 8000 },
      });
      if (order.checklistVersions[0]) {
        await tx.checklistVersion.update({
          where: { id: order.checklistVersions[0].id },
          data: { tailorAcceptedAt: now },
        });
      }
      await appendOrderEvent(tx, {
        orderId,
        fromState: "DRAFT",
        toState: "PROPOSED",
        actorId: order.tailorId,
        type: "STATE_CHANGE",
        payload: { proposedPriceCents: 8000 },
      });
    });
    return NextResponse.json({ ok: true, state: "PROPOSED" });
  }

  // 2. PROPOSED -> AGREED (Customer accepts proposal)
  if (order.state === "PROPOSED") {
    await prisma.$transaction(async (tx) => {
      if (order.checklistVersions[0]) {
        await tx.checklistVersion.update({
          where: { id: order.checklistVersions[0].id },
          data: { customerAcceptedAt: now },
        });
      }
      await tx.order.update({
        where: { id: orderId },
        data: { state: "AGREED" },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "PROPOSED",
        toState: "AGREED",
        actorId: order.customerId,
        type: "CHECKLIST_ACCEPTED",
        payload: { version: order.checklistVersions[0]?.version ?? 1 },
      });
    });
    return NextResponse.json({ ok: true, state: "AGREED" });
  }

  // 3. AGREED -> AUTHORIZED (PayPal escrow authorization hold)
  if (order.state === "AGREED") {
    const amountCents = order.totalCents > 0 ? order.totalCents : 8000;
    const authId = `demo-auth-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId,
          amountCents,
          type: "BASE",
          status: "AUTHORIZED",
          paypalOrderId: `demo-order-${Date.now()}`,
          paypalAuthorizationId: authId,
          authorizedAt: now,
          honorUntil: new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000),
          lastPaypalStatus: "CREATED",
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { state: "AUTHORIZED" },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "AGREED",
        toState: "AUTHORIZED",
        actorId: order.customerId,
        type: "PAYPAL_AUTHORIZED",
        payload: { authorizationId: authId, amountCents, paymentId: payment.id },
      });
    });
    return NextResponse.json({ ok: true, state: "AUTHORIZED" });
  }

  // 4. AUTHORIZED -> IN_PROGRESS (Tailor begins construction)
  if (order.state === "AUTHORIZED") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { state: "IN_PROGRESS" },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "AUTHORIZED",
        toState: "IN_PROGRESS",
        actorId: order.tailorId,
        type: "STATE_CHANGE",
        payload: { startedAt: now.toISOString() },
      });
    });
    return NextResponse.json({ ok: true, state: "IN_PROGRESS" });
  }

  // 5. IN_PROGRESS -> CHECK_PASSED (Photo inspection verified)
  if (order.state === "IN_PROGRESS") {
    await prisma.$transaction(async (tx) => {
      await tx.photo.create({
        data: {
          orderId,
          uploaderId: order.tailorId,
          storagePath: `orders/${orderId}/round-0/finished-sample.jpg`,
          kind: "FINISHED",
          round: order.checkRound,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { state: "CHECK_PASSED" },
      });
      const items = (order.checklistVersions[0]?.items ?? []) as Array<{ id: string }>;
      const verdicts = items.map((i) => ({ itemId: i.id, verdict: "MET", evidence: "Specification verified against garment photo" }));
      await appendOrderEvent(tx, {
        orderId,
        fromState: "IN_PROGRESS",
        toState: "CHECK_PASSED",
        actorId: "SYSTEM",
        type: "PHOTO_CHECK_PASSED",
        payload: { verdicts },
      });
    });
    return NextResponse.json({ ok: true, state: "CHECK_PASSED" });
  }

  // 6. CHECK_PASSED -> SHIPPED (Tailor confirms dispatch)
  if (order.state === "CHECK_PASSED") {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { state: "SHIPPED", shippedAt: now },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "CHECK_PASSED",
        toState: "SHIPPED",
        actorId: order.tailorId,
        type: "STATE_CHANGE",
        payload: { shippedAt: now.toISOString() },
      });
    });
    return NextResponse.json({ ok: true, state: "SHIPPED" });
  }

  // 7. SHIPPED -> RELEASED (Customer confirms fit & releases payment)
  if (order.state === "SHIPPED") {
    await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { orderId, status: "AUTHORIZED" },
        data: { status: "CAPTURED", capturedAt: now },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { state: "RELEASED" },
      });
      await appendOrderEvent(tx, {
        orderId,
        fromState: "SHIPPED",
        toState: "RELEASED",
        actorId: order.customerId,
        type: "PAYPAL_CAPTURED",
        payload: { releasedAt: now.toISOString(), amountCents: order.totalCents },
      });
    });
    return NextResponse.json({ ok: true, state: "RELEASED" });
  }

  return NextResponse.json({ ok: true, state: order.state });
}
