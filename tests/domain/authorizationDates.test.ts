import { describe, it, expect } from "vitest";
import {
  honorPeriodEnd,
  effectiveHonorPeriodEnd,
  autoCaptureCutoff,
  maxAuthCutoff,
  shouldReauthorize,
  shouldAutoCapture,
  type ReauthorizeCandidate,
  type AutoCaptureCandidate,
} from "../../src/domain/authorizationDates";

const DAY = 24 * 60 * 60 * 1000;
const base = new Date("2026-01-01T00:00:00Z");
const daysAfter = (n: number) => new Date(base.getTime() + n * DAY);

describe("honorPeriodEnd", () => {
  it("returns base + 3 days", () => {
    expect(honorPeriodEnd(base).getTime()).toBe(daysAfter(3).getTime());
  });
});

describe("effectiveHonorPeriodEnd", () => {
  it("without reauth: returns authorizedAt + 3d", () => {
    expect(effectiveHonorPeriodEnd(base, null).getTime()).toBe(daysAfter(3).getTime());
  });

  it("with reauth: returns reauthorizedAt + 3d", () => {
    const reauth = daysAfter(5);
    expect(effectiveHonorPeriodEnd(base, reauth).getTime()).toBe(
      new Date(reauth.getTime() + 3 * DAY).getTime(),
    );
  });
});

describe("autoCaptureCutoff", () => {
  it("returns base + 25 days", () => {
    expect(autoCaptureCutoff(base).getTime()).toBe(daysAfter(25).getTime());
  });
});

describe("maxAuthCutoff", () => {
  it("returns base + 28 days", () => {
    expect(maxAuthCutoff(base).getTime()).toBe(daysAfter(28).getTime());
  });
});

describe("shouldReauthorize", () => {
  const p = (
    authorizedAt: Date | null,
    reauthorizedAt: Date | null = null,
  ): ReauthorizeCandidate => ({ authorizedAt, reauthorizedAt });

  it("false when no authorizedAt", () => {
    expect(shouldReauthorize(p(null), daysAfter(4))).toBe(false);
  });

  it("false before honor period ends (day 2)", () => {
    expect(shouldReauthorize(p(base), daysAfter(2))).toBe(false);
  });

  it("true exactly at honor period end (day 3)", () => {
    expect(shouldReauthorize(p(base), daysAfter(3))).toBe(true);
  });

  it("true mid-window (day 20)", () => {
    expect(shouldReauthorize(p(base), daysAfter(20))).toBe(true);
  });

  it("false at day 29 (expiry boundary)", () => {
    expect(shouldReauthorize(p(base), daysAfter(29))).toBe(false);
  });

  it("false after day 29", () => {
    expect(shouldReauthorize(p(base), daysAfter(30))).toBe(false);
  });

  it("false if already reauthorized", () => {
    expect(shouldReauthorize(p(base, daysAfter(5)), daysAfter(10))).toBe(false);
  });
});

describe("shouldAutoCapture", () => {
  const shipped = (shippedAt: Date | null): AutoCaptureCandidate => ({
    shippedAt,
    fitConfirmedAt: null,
    state: "SHIPPED",
  });

  const payment = (authorizedAt: Date): ReauthorizeCandidate => ({
    authorizedAt,
    reauthorizedAt: null,
  });

  it("false when no authorizedAt", () => {
    expect(
      shouldAutoCapture(shipped(daysAfter(1)), { authorizedAt: null, reauthorizedAt: null }, daysAfter(30)),
    ).toBe(false);
  });

  it("false when fitConfirmedAt is set", () => {
    const order: AutoCaptureCandidate = {
      shippedAt: daysAfter(1),
      fitConfirmedAt: daysAfter(2),
      state: "SHIPPED",
    };
    expect(shouldAutoCapture(order, payment(base), daysAfter(30))).toBe(false);
  });

  it("false when state is DISPUTED", () => {
    const order: AutoCaptureCandidate = {
      shippedAt: daysAfter(1),
      fitConfirmedAt: null,
      state: "DISPUTED",
    };
    expect(shouldAutoCapture(order, payment(base), daysAfter(30))).toBe(false);
  });

  it("false when state is not SHIPPED", () => {
    const order: AutoCaptureCandidate = {
      shippedAt: daysAfter(1),
      fitConfirmedAt: null,
      state: "CHECK_PASSED",
    };
    expect(shouldAutoCapture(order, payment(base), daysAfter(30))).toBe(false);
  });

  it("true on emergency path: day 28 reached (even if 7-day window not passed)", () => {
    // shipped on day 27 — 7 days not yet passed, but day 28 triggers emergency capture
    expect(shouldAutoCapture(shipped(daysAfter(27)), payment(base), daysAfter(28))).toBe(true);
  });

  it("true when both shippedAt+7d and autoCaptureCutoff (day 25) have passed", () => {
    // shipped on day 10; ship+7 = day 17; autoCaptureCutoff = day 25; now = day 26
    expect(shouldAutoCapture(shipped(daysAfter(10)), payment(base), daysAfter(26))).toBe(true);
  });

  it("false when shippedAt+7d passed but autoCaptureCutoff not reached", () => {
    // shipped on day 1; ship+7 = day 8; autoCaptureCutoff = day 25; now = day 15
    expect(shouldAutoCapture(shipped(daysAfter(1)), payment(base), daysAfter(15))).toBe(false);
  });

  it("false when autoCaptureCutoff reached but shippedAt+7d not passed", () => {
    // shipped on day 24; ship+7 = day 31; now = day 25
    expect(shouldAutoCapture(shipped(daysAfter(24)), payment(base), daysAfter(25))).toBe(false);
  });

  it("false when no shippedAt (not emergency)", () => {
    expect(shouldAutoCapture(shipped(null), payment(base), daysAfter(26))).toBe(false);
  });
});
