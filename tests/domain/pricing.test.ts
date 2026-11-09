import { describe, expect, it } from "vitest";
import {
  computeAddOnTotals,
  computeOrderTotals,
  DEFAULT_FIRST_ORDER_DISCOUNT_BPS,
  formatCents,
  percentOf,
  PricingError,
  toPayPalAmount,
  type PriceLine,
} from "../../src/domain/pricing";

const lines: PriceLine[] = [
  { kind: "BASE", label: "Silk blouse stitching", amountCents: 15000 },
  { kind: "BASE", label: "Lining", amountCents: 3000 },
  { kind: "RUSH", label: "Rush fee", amountCents: 2000 },
  { kind: "SHIPPING", label: "International shipping", amountCents: 2500 },
  { kind: "CUSTOMS", label: "Customs duty", amountCents: 1000 },
];

const firstOrder = { percentBps: DEFAULT_FIRST_ORDER_DISCOUNT_BPS, eligible: true };
const repeatOrder = { percentBps: DEFAULT_FIRST_ORDER_DISCOUNT_BPS, eligible: false };

describe("percentOf", () => {
  it("rounds half up", () => {
    expect(percentOf(12345, 1000)).toBe(1235);
    expect(percentOf(12344, 1000)).toBe(1234);
  });
});

describe("computeOrderTotals", () => {
  it("applies 10% only to BASE lines on a first order", () => {
    const t = computeOrderTotals(lines, firstOrder);
    expect(t.baseCents).toBe(18000);
    expect(t.discountCents).toBe(1800);
    expect(t.totalCents).toBe(18000 + 2000 + 2500 + 1000 - 1800);
    expect(t.appliedDiscountBps).toBe(1000);
  });

  it("gives no discount on a repeat order", () => {
    const t = computeOrderTotals(lines, repeatOrder);
    expect(t.discountCents).toBe(0);
    expect(t.totalCents).toBe(23500);
  });

  it("rejects ADDON lines, negative amounts, floats and discounts above 30%", () => {
    expect(() => computeOrderTotals([{ kind: "ADDON", label: "x", amountCents: 100 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals([{ kind: "BASE", label: "x", amountCents: -1 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals([{ kind: "BASE", label: "x", amountCents: 10.5 }], firstOrder)).toThrow(PricingError);
    expect(() => computeOrderTotals(lines, { percentBps: 3500, eligible: true })).toThrow(PricingError);
  });

  it("requires a positive BASE subtotal", () => {
    expect(() => computeOrderTotals([{ kind: "SHIPPING", label: "x", amountCents: 500 }], firstOrder)).toThrow(PricingError);
  });
});

describe("computeAddOnTotals", () => {
  it("handles the $200 -> $500 case and flags a large jump", () => {
    const original = computeOrderTotals([{ kind: "BASE", label: "Kurta", amountCents: 20000 }], repeatOrder);
    const a = computeAddOnTotals(original, [{ kind: "ADDON", label: "Embroidery", amountCents: 30000 }]);
    expect(a.addOnCents).toBe(30000);
    expect(a.newGrandTotalCents).toBe(50000);
    expect(a.jumpBps).toBe(15000);
    expect(a.isLargeJump).toBe(true);
  });

  it("does not flag a small add-on", () => {
    const original = computeOrderTotals([{ kind: "BASE", label: "Kurta", amountCents: 20000 }], repeatOrder);
    const a = computeAddOnTotals(original, [{ kind: "ADDON", label: "Buttons", amountCents: 1500 }]);
    expect(a.isLargeJump).toBe(false);
  });
});

describe("toPayPalAmount", () => {
  it("builds a breakdown that adds up to the value", () => {
    const amount = toPayPalAmount(computeOrderTotals(lines, firstOrder));
    expect(amount.value).toBe("217.00");
    expect(amount.breakdown.item_total.value).toBe("180.00");
    expect(amount.breakdown.handling.value).toBe("20.00");
    expect(amount.breakdown.shipping.value).toBe("25.00");
    expect(amount.breakdown.tax_total.value).toBe("10.00");
    expect(amount.breakdown.discount.value).toBe("18.00");
  });

  it("formats cents", () => {
    expect(formatCents(5)).toBe("0.05");
    expect(formatCents(123456)).toBe("1234.56");
  });
});
