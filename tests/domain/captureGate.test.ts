import { describe, it, expect } from 'vitest'
import { canCapture, type CaptureGateInput } from '../../src/domain/captureGate'

const happy: CaptureGateInput = {
  state: 'SHIPPED',
  photoVerdicts: [
    { itemId: 'p1', verdict: 'MET' },
    { itemId: 'p2', verdict: 'MET' },
  ],
  acceptAnyway: false,
  fitItems: ['f1'],
  fitConfirmations: ['f1'],
}

describe('canCapture', () => {
  it('returns ok on happy path', () => {
    expect(canCapture(happy)).toEqual({ ok: true })
  })

  it('blocks when state is not SHIPPED', () => {
    const result = canCapture({ ...happy, state: 'CHECK_PASSED' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons).toContain('Order must be SHIPPED to capture, current state: CHECK_PASSED')
    }
  })

  it('blocks when state is DISPUTED (M4)', () => {
    const result = canCapture({ ...happy, state: 'DISPUTED' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons).toContain('Order is disputed')
    }
  })

  it('blocks when photo verdicts have unmet items', () => {
    const result = canCapture({
      ...happy,
      photoVerdicts: [
        { itemId: 'p1', verdict: 'MET' },
        { itemId: 'p2', verdict: 'PARTLY_MET' },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons).toContain('1 photo check(s) not passed')
    }
  })

  it('allows unmet photos when acceptAnyway is true', () => {
    const result = canCapture({
      ...happy,
      photoVerdicts: [{ itemId: 'p1', verdict: 'NOT_MET' }],
      acceptAnyway: true,
    })
    expect(result.ok).toBe(true)
  })

  it('blocks when fit items are not confirmed', () => {
    const result = canCapture({
      ...happy,
      fitItems: ['f1', 'f2'],
      fitConfirmations: ['f1'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons).toContain('1 fit item(s) not confirmed')
    }
  })

  it('collects all reasons when multiple conditions fail', () => {
    const result = canCapture({
      state: 'DISPUTED',
      photoVerdicts: [{ itemId: 'p1', verdict: 'NOT_MET' }],
      acceptAnyway: false,
      fitItems: ['f1'],
      fitConfirmations: [],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reasons).toHaveLength(3)
      expect(result.reasons).toContain('Order is disputed')
      expect(result.reasons).toContain('1 photo check(s) not passed')
      expect(result.reasons).toContain('1 fit item(s) not confirmed')
    }
  })

  it('handles empty photo verdicts and fit items', () => {
    const result = canCapture({
      state: 'SHIPPED',
      photoVerdicts: [],
      acceptAnyway: false,
      fitItems: [],
      fitConfirmations: [],
    })
    expect(result.ok).toBe(true)
  })
})
