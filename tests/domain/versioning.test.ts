import { describe, it, expect } from 'vitest'
import { isAccepted, needsAcceptance, bumpVersion, diffChecklist } from '../../src/domain/versioning'

const NOW = new Date('2026-11-10T12:00:00Z')

describe('isAccepted', () => {
  it('true when both sides accepted', () => {
    expect(isAccepted({ version: 1, tailorAcceptedAt: NOW, customerAcceptedAt: NOW })).toBe(true)
  })

  it('false when only tailor accepted', () => {
    expect(isAccepted({ version: 1, tailorAcceptedAt: NOW, customerAcceptedAt: null })).toBe(false)
  })

  it('false when only customer accepted', () => {
    expect(isAccepted({ version: 1, tailorAcceptedAt: null, customerAcceptedAt: NOW })).toBe(false)
  })

  it('false when neither accepted', () => {
    expect(isAccepted({ version: 1, tailorAcceptedAt: null, customerAcceptedAt: null })).toBe(false)
  })
})

describe('needsAcceptance', () => {
  it('tailor needs acceptance when not yet accepted', () => {
    expect(needsAcceptance({ version: 1, tailorAcceptedAt: null, customerAcceptedAt: NOW }, 'tailor')).toBe(true)
  })

  it('tailor does not need acceptance when already accepted', () => {
    expect(needsAcceptance({ version: 1, tailorAcceptedAt: NOW, customerAcceptedAt: null }, 'tailor')).toBe(false)
  })

  it('customer needs acceptance when not yet accepted', () => {
    expect(needsAcceptance({ version: 1, tailorAcceptedAt: NOW, customerAcceptedAt: null }, 'customer')).toBe(true)
  })

  it('customer does not need acceptance when already accepted', () => {
    expect(needsAcceptance({ version: 1, tailorAcceptedAt: null, customerAcceptedAt: NOW }, 'customer')).toBe(false)
  })
})

describe('bumpVersion', () => {
  it('increments by 1', () => {
    expect(bumpVersion(1)).toBe(2)
    expect(bumpVersion(2)).toBe(3)
    expect(bumpVersion(0)).toBe(1)
  })
})

describe('diffChecklist', () => {
  type Item = { id: string; label: string; amountCents: number }

  const base: Item[] = [
    { id: 'a', label: 'Hemming', amountCents: 1000 },
    { id: 'b', label: 'Lining', amountCents: 2000 },
    { id: 'c', label: 'Buttons', amountCents: 500 },
  ]

  it('returns empty diff when nothing changed', () => {
    const diff = diffChecklist(base, [...base])
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
  })

  it('detects an added item', () => {
    const next: Item[] = [...base, { id: 'd', label: 'Rush fee', amountCents: 3000 }]
    const diff = diffChecklist(base, next)
    expect(diff.added).toHaveLength(1)
    expect(diff.added[0].id).toBe('d')
    expect(diff.removed).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
  })

  it('detects a removed item', () => {
    const next: Item[] = base.filter((i) => i.id !== 'b')
    const diff = diffChecklist(base, next)
    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0].id).toBe('b')
    expect(diff.added).toHaveLength(0)
    expect(diff.changed).toHaveLength(0)
  })

  it('detects a changed item (label edit)', () => {
    const next: Item[] = base.map((i) =>
      i.id === 'a' ? { ...i, label: 'Hemming (updated)' } : i,
    )
    const diff = diffChecklist(base, next)
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].id).toBe('a')
    expect(diff.changed[0].before.label).toBe('Hemming')
    expect(diff.changed[0].after.label).toBe('Hemming (updated)')
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
  })

  it('handles mixed add + remove + change in one diff', () => {
    const next: Item[] = [
      { id: 'a', label: 'Hemming (new price)', amountCents: 1500 }, // changed
      { id: 'c', label: 'Buttons', amountCents: 500 },              // unchanged
      { id: 'd', label: 'Embroidery', amountCents: 4000 },          // added
      // 'b' removed
    ]
    const diff = diffChecklist(base, next)
    expect(diff.added.map((i) => i.id)).toEqual(['d'])
    expect(diff.removed.map((i) => i.id)).toEqual(['b'])
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].id).toBe('a')
  })
})
