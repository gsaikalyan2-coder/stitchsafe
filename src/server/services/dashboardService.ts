// src/server/services/dashboardService.ts
// Read-only dashboard queries. No state changes, no PayPal, no AI.

import { prisma } from "@/server/db";
import { formatCents } from "@/domain/pricing";

// ── P4 stage groups ────────────────────────────────────────────────────────────

const STAGE_GROUPS: Record<string, string[]> = {
  "Pending payment": ["AGREED"],
  "In progress": ["AUTHORIZED", "IN_PROGRESS"],
  "Under check": ["SUBMITTED", "CHECK_FAILED", "CHECK_PASSED"],
  "Delivered": ["SHIPPED"],
  "Released": ["RELEASED"],
  "Closed": ["CANCELLED", "VOIDED"],
  "Disputed": ["DISPUTED"],
};

// ── customerSummary ────────────────────────────────────────────────────────────

export async function customerSummary(userId: string) {
  const orders = await prisma.order.findMany({
    where: { customerId: userId },
    include: {
      tailor: { select: { id: true, name: true } },
      payments: { where: { status: "AUTHORIZED" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const totalHeldCents = orders.reduce(
    (sum, o) => sum + o.payments.reduce((s, p) => s + p.amountCents, 0),
    0,
  );

  const actionNeeded: Array<{ orderId: string; action: string }> = [];
  for (const o of orders) {
    if (o.state === "AGREED") actionNeeded.push({ orderId: o.id, action: "Authorize payment" });
    if (o.state === "SHIPPED") actionNeeded.push({ orderId: o.id, action: "Confirm fit & release" });
    if (o.state === "CHECK_FAILED" && o.checkRound >= 2) {
      actionNeeded.push({ orderId: o.id, action: "Accept anyway or cancel" });
    }
  }

  return {
    orders: orders.map((o) => ({
      id: o.id,
      tailorName: o.tailor.name,
      state: o.state,
      totalCents: o.totalCents,
      totalFormatted: formatCents(o.totalCents),
      dueDate: o.dueDate,
      heldCents: o.payments.reduce((s, p) => s + p.amountCents, 0),
    })),
    totalHeldCents,
    totalHeldFormatted: formatCents(totalHeldCents),
    actionNeeded,
  };
}

// ── tailorSummary ──────────────────────────────────────────────────────────────

export async function tailorSummary(userId: string) {
  const orders = await prisma.order.findMany({
    where: { tailorId: userId },
    include: {
      customer: { select: { id: true, name: true } },
      payments: { where: { status: "AUTHORIZED" } },
      changeRequests: { where: { status: "PENDING_PRICE" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const moneyOnHoldCents = orders.reduce(
    (sum, o) => sum + o.payments.reduce((s, p) => s + p.amountCents, 0),
    0,
  );

  const stageCounts: Record<string, number> = {};
  for (const [group, states] of Object.entries(STAGE_GROUPS)) {
    stageCounts[group] = orders.filter((o) => states.includes(o.state)).length;
  }

  const revisedPaymentCount = orders.filter(
    (o) => o.payments.some((p) => p.status === "AUTHORIZED") && o.changeRequests.length > 0,
  ).length;

  const actionNeeded: Array<{ orderId: string; action: string }> = [];
  for (const o of orders) {
    if (o.state === "DRAFT") actionNeeded.push({ orderId: o.id, action: "Set prices & propose" });
    if (o.state === "PROPOSED") actionNeeded.push({ orderId: o.id, action: "Accept checklist" });
    if (o.state === "AUTHORIZED") actionNeeded.push({ orderId: o.id, action: "Start work" });
    if (o.state === "IN_PROGRESS" || o.state === "CHECK_FAILED") {
      actionNeeded.push({ orderId: o.id, action: "Upload photos" });
    }
    if (o.state === "CHECK_PASSED") actionNeeded.push({ orderId: o.id, action: "Mark shipped" });
    if (o.changeRequests.length > 0) {
      actionNeeded.push({ orderId: o.id, action: "Price change request" });
    }
    if (o.state === "DISPUTED") actionNeeded.push({ orderId: o.id, action: "Dispute pending" });
  }

  // Deadline tracker (P8)
  const now = new Date();
  const TERMINAL = new Set(["SHIPPED", "RELEASED", "CANCELLED", "VOIDED"]);
  const deadlineOrders = orders
    .filter((o) => o.dueDate && !TERMINAL.has(o.state))
    .map((o) => ({
      orderId: o.id,
      customerName: o.customer.name,
      dueDate: o.dueDate!,
      overdue: now > o.dueDate!,
      daysLeft: Math.ceil((o.dueDate!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    }))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  // Trust badges
  const tailor = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { phoneVerified: true, accounts: { where: { provider: "paypal" } } },
  });

  const shippedOrders = orders.filter((o) => ["SHIPPED", "RELEASED"].includes(o.state));
  const onTimeCount = shippedOrders.filter(
    (o) => o.dueDate && o.shippedAt && o.shippedAt <= o.dueDate,
  ).length;
  const onTimePct = shippedOrders.length > 0
    ? Math.round((onTimeCount / shippedOrders.length) * 100)
    : null;

  return {
    moneyOnHoldCents,
    moneyOnHoldFormatted: formatCents(moneyOnHoldCents),
    stageCounts,
    revisedPaymentCount,
    actionNeeded,
    deadlineOrders,
    trustBadges: {
      phoneVerified: tailor.phoneVerified,
      paypalVerified: tailor.accounts.length > 0,
      onTimePct,
    },
    orders: orders.map((o) => ({
      id: o.id,
      customerName: o.customer.name,
      state: o.state,
      totalCents: o.totalCents,
      dueDate: o.dueDate,
      checkRound: o.checkRound,
      hasLiveAddOn: o.changeRequests.length > 0,
    })),
  };
}
