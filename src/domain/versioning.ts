export interface ChecklistVersion {
  version: number
  tailorAcceptedAt: Date | null
  customerAcceptedAt: Date | null
}

export function isAccepted(v: ChecklistVersion): boolean {
  return v.tailorAcceptedAt !== null && v.customerAcceptedAt !== null
}

export function needsAcceptance(v: ChecklistVersion, role: 'tailor' | 'customer'): boolean {
  if (role === 'tailor') return v.tailorAcceptedAt === null
  return v.customerAcceptedAt === null
}

export function bumpVersion(current: number): number {
  return current + 1
}

export interface ChecklistDiff<T> {
  added: T[]
  removed: T[]
  changed: { id: string; before: T; after: T }[]
}

export function diffChecklist<T extends { id: string }>(
  prev: T[],
  next: T[],
): ChecklistDiff<T> {
  const prevMap = new Map(prev.map((item) => [item.id, item]))
  const nextMap = new Map(next.map((item) => [item.id, item]))

  const added: T[] = []
  const removed: T[] = []
  const changed: { id: string; before: T; after: T }[] = []

  for (const [id, nextItem] of nextMap) {
    if (!prevMap.has(id)) {
      added.push(nextItem)
    } else {
      const prevItem = prevMap.get(id)!
      if (JSON.stringify(prevItem) !== JSON.stringify(nextItem)) {
        changed.push({ id, before: prevItem, after: nextItem })
      }
    }
  }

  for (const [id, prevItem] of prevMap) {
    if (!nextMap.has(id)) {
      removed.push(prevItem)
    }
  }

  return { added, removed, changed }
}
