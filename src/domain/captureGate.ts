import type { OrderState } from '@/generated/prisma/client'

export interface CaptureGateInput {
  state: OrderState
  photoVerdicts: Array<{ itemId: string; verdict: 'MET' | 'PARTLY_MET' | 'NOT_MET' }>
  acceptAnyway: boolean
  fitItems: string[]          // itemIds with checkMethod="fit"
  fitConfirmations: string[]  // itemIds that have been confirmed
}

export interface CaptureOk { ok: true }
export interface CaptureBlocked { ok: false; reasons: string[] }
export type CaptureGateResult = CaptureOk | CaptureBlocked

export function canCapture(input: CaptureGateInput): CaptureGateResult {
  const reasons: string[] = []

  if (input.state === 'DISPUTED') {
    reasons.push('Order is disputed')
  }

  if (input.state !== 'SHIPPED' && input.state !== 'DISPUTED') {
    reasons.push(`Order must be SHIPPED to capture, current state: ${input.state}`)
  }

  if (!input.acceptAnyway) {
    const unmet = input.photoVerdicts.filter(v => v.verdict !== 'MET')
    if (unmet.length > 0) {
      reasons.push(`${unmet.length} photo check(s) not passed`)
    }
  }

  const confirmedSet = new Set(input.fitConfirmations)
  const unconfirmedFit = input.fitItems.filter(id => !confirmedSet.has(id))
  if (unconfirmedFit.length > 0) {
    reasons.push(`${unconfirmedFit.length} fit item(s) not confirmed`)
  }

  if (reasons.length > 0) return { ok: false, reasons }
  return { ok: true }
}
