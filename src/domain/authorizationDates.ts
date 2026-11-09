// src/domain/authorizationDates.ts
// Pure date helpers for PayPal authorization lifecycle. No I/O.
//
// Authorization lifecycle (all days relative to authorizedAt):
//   Day  0: authorized
//   Day  3: honor period ends → reauthorize window opens
//   Day 18: tailor's deadline (so 7-day fit window ends by day 25)
//   Day 25: auto-capture cutoff (silent customer)
//   Day 28: max auth age → capture immediately rather than let hold expire
//   Day 29: auth expires → never reach this

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

/** Authorization honor period ends 3 days after the authorization was created. */
export function honorPeriodEnd(authorizedAt: Date): Date {
  return addDays(authorizedAt, 3);
}

/**
 * Returns the effective honor period end:
 * - After a reauthorization: reauthorizedAt + 3 days
 * - Otherwise: authorizedAt + 3 days
 */
export function effectiveHonorPeriodEnd(authorizedAt: Date, reauthorizedAt: Date | null): Date {
  return reauthorizedAt ? addDays(reauthorizedAt, 3) : honorPeriodEnd(authorizedAt);
}

/** Day 25: auto-capture a shipped order if customer has not confirmed fit. */
export function autoCaptureCutoff(authorizedAt: Date): Date {
  return addDays(authorizedAt, 25);
}

/** Day 28: capture immediately (before day 29 expiry) if still SHIPPED. */
export function maxAuthCutoff(authorizedAt: Date): Date {
  return addDays(authorizedAt, 28);
}

export interface ReauthorizeCandidate {
  authorizedAt: Date | null;
  reauthorizedAt: Date | null;
}

/**
 * Returns true when this payment should be reauthorized via cron.
 * Conditions: past the honor period, before day 29, not yet reauthorized.
 * Only one reauthorization is allowed per payment.
 */
export function shouldReauthorize(payment: ReauthorizeCandidate, now: Date): boolean {
  if (!payment.authorizedAt) return false;
  if (payment.reauthorizedAt) return false; // already reauthorized once

  const honorEnd = honorPeriodEnd(payment.authorizedAt);
  const maxAge = addDays(payment.authorizedAt, 29); // day 29 = expiry, never cross

  return now >= honorEnd && now < maxAge;
}

export interface AutoCaptureCandidate {
  shippedAt: Date | null;
  fitConfirmedAt: Date | null;
  state: string;
}

/**
 * Returns true when a SHIPPED order should be auto-captured by the cron.
 * Triggers when EITHER:
 *   - shippedAt + 7 days has passed AND authorizedAt + 25 days has passed
 *   - authorizedAt + 28 days is reached (emergency capture before expiry)
 * Never triggers if fitConfirmedAt is set or if DISPUTED.
 */
export function shouldAutoCapture(
  order: AutoCaptureCandidate,
  payment: ReauthorizeCandidate,
  now: Date,
): boolean {
  if (!payment.authorizedAt) return false;
  if (order.fitConfirmedAt) return false;
  if (order.state === "DISPUTED") return false;
  if (order.state !== "SHIPPED") return false;

  const emergencyCutoff = maxAuthCutoff(payment.authorizedAt);
  if (now >= emergencyCutoff) return true; // day 28 emergency capture

  if (!order.shippedAt) return false;
  const silentCustomerCutoff = autoCaptureCutoff(payment.authorizedAt);
  const sevenDaysAfterShip = addDays(order.shippedAt, 7);

  return now >= sevenDaysAfterShip && now >= silentCustomerCutoff;
}
