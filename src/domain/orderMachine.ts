/** Mirror of the Prisma OrderState enum — defined locally so domain has no I/O dependency. */
export enum OrderState {
  DRAFT = 'DRAFT',
  PROPOSED = 'PROPOSED',
  AGREED = 'AGREED',
  AUTHORIZED = 'AUTHORIZED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  CHECK_PASSED = 'CHECK_PASSED',
  CHECK_FAILED = 'CHECK_FAILED',
  SHIPPED = 'SHIPPED',
  RELEASED = 'RELEASED',
  CANCELLED = 'CANCELLED',
  VOIDED = 'VOIDED',
  DISPUTED = 'DISPUTED',
}

export interface TransitionContext {
  /** Number of re-upload rounds already used (CHECK_FAILED→SUBMITTED guard). */
  reUploadRounds?: number
}

export type Actor = 'CUSTOMER' | 'TAILOR' | 'SYSTEM'

/** States that have a live PayPal authorization (void required on cancel). */
const AUTHORIZED_STATES = new Set<OrderState>([
  OrderState.AUTHORIZED,
  OrderState.IN_PROGRESS,
  OrderState.SUBMITTED,
  OrderState.CHECK_PASSED,
  OrderState.CHECK_FAILED,
  OrderState.SHIPPED,
])

/** Terminal states — no further transitions allowed. */
const TERMINAL_STATES = new Set<OrderState>([
  OrderState.RELEASED,
  OrderState.CANCELLED,
  OrderState.VOIDED,
])

export function canTransition(
  from: OrderState,
  to: OrderState,
  ctx: TransitionContext = {},
): boolean {
  // Terminal states cannot transition anywhere.
  if (TERMINAL_STATES.has(from)) return false

  // DISPUTED blocks all transitions except staying DISPUTED.
  if (from === OrderState.DISPUTED) return false

  switch (to) {
    // ── Happy path ──────────────────────────────────────────────────────────
    case OrderState.PROPOSED:
      return from === OrderState.DRAFT

    case OrderState.AGREED:
      return from === OrderState.PROPOSED

    case OrderState.AUTHORIZED:
      return from === OrderState.AGREED

    case OrderState.IN_PROGRESS:
      return from === OrderState.AUTHORIZED

    case OrderState.SUBMITTED:
      // Normal flow: IN_PROGRESS → SUBMITTED
      // Re-upload: CHECK_FAILED → SUBMITTED (max 2 rounds already used)
      if (from === OrderState.IN_PROGRESS) return true
      if (from === OrderState.CHECK_FAILED) {
        return (ctx.reUploadRounds ?? 0) < 2
      }
      return false

    case OrderState.CHECK_FAILED:
      return from === OrderState.SUBMITTED

    case OrderState.CHECK_PASSED:
      // Normal AI pass
      if (from === OrderState.SUBMITTED) return true
      // Customer accept-anyway after exhausting re-upload rounds
      if (from === OrderState.CHECK_FAILED) {
        return (ctx.reUploadRounds ?? 0) >= 2
      }
      return false

    case OrderState.SHIPPED:
      return from === OrderState.CHECK_PASSED

    case OrderState.RELEASED:
      return from === OrderState.SHIPPED

    // ── Side exits ───────────────────────────────────────────────────────────
    case OrderState.CANCELLED:
      // Only before any authorization
      return !AUTHORIZED_STATES.has(from)

    case OrderState.VOIDED:
      // Only after authorization, not from terminal or DISPUTED
      return AUTHORIZED_STATES.has(from)

    case OrderState.DISPUTED:
      // Any non-terminal state may be disputed (from !== DISPUTED already guaranteed by early return above)
      return !TERMINAL_STATES.has(from)

    default:
      return false
  }
}

/**
 * Returns true only when the transition is both state-valid (canTransition)
 * and the given actor is authorised to perform it.
 */
export function canActorTransition(
  from: OrderState,
  to: OrderState,
  actor: Actor,
  ctx: TransitionContext = {},
): boolean {
  if (!canTransition(from, to, ctx)) return false

  switch (to) {
    case OrderState.PROPOSED:
      return actor === 'TAILOR'

    case OrderState.AGREED:
      // System records agreement after both parties accept the checklist version
      return actor === 'SYSTEM'

    case OrderState.AUTHORIZED:
      // Customer clicks Pay
      return actor === 'CUSTOMER'

    case OrderState.IN_PROGRESS:
      return actor === 'TAILOR'

    case OrderState.SUBMITTED:
      // Tailor uploads photos (initial or re-upload)
      return actor === 'TAILOR'

    case OrderState.CHECK_FAILED:
      // AI photo check result
      return actor === 'SYSTEM'

    case OrderState.CHECK_PASSED:
      if (from === OrderState.SUBMITTED) return actor === 'SYSTEM'
      // accept-anyway after exhausted re-upload rounds
      if (from === OrderState.CHECK_FAILED) return actor === 'CUSTOMER'
      return false

    case OrderState.SHIPPED:
      return actor === 'TAILOR'

    case OrderState.RELEASED:
      // Customer fit confirmation or system day-25 auto-capture
      return actor === 'CUSTOMER' || actor === 'SYSTEM'

    case OrderState.CANCELLED:
      return actor === 'CUSTOMER' || actor === 'TAILOR'

    case OrderState.VOIDED:
      return actor === 'CUSTOMER' || actor === 'TAILOR'

    case OrderState.DISPUTED:
      return actor === 'CUSTOMER' || actor === 'TAILOR'

    default:
      return false
  }
}
