import type { Unit } from './types'

// Подразделения деревом (с глубиной) — для выпадающих списков с отступами
export function flattenUnits(units: Unit[], parent: number | null = null, depth = 0): { unit: Unit; depth: number }[] {
  return units
    .filter((u) => u.parent_id === parent)
    .flatMap((u) => [{ unit: u, depth }, ...flattenUnits(units, u.id, depth + 1)])
}

export const indent = (depth: number) => '   '.repeat(depth)

// Подразделение и все вложенные в него
export function descendants(units: Unit[], rootId: number): Set<number> {
  const ids = new Set([rootId])
  let added = true
  while (added) {
    added = false
    for (const u of units) if (u.parent_id != null && ids.has(u.parent_id) && !ids.has(u.id)) { ids.add(u.id); added = true }
  }
  return ids
}
