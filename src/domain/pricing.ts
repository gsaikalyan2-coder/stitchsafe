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
