import type { Employee } from './types'

type Person = Pick<Employee, 'id' | 'manager_id'> & Partial<Pick<Employee, 'role' | 'unit_id'>>

export type Relation = 'руководитель' | 'коллега' | 'подчинённый'

// «Свои» для выбора заместителя: свой руководитель, коллеги (тот же руководитель и та же должность
// или то же подразделение), свои подчинённые
export function colleaguesOf<T extends Person>(meId: number, people: T[]): { person: T; relation: Relation }[] {
  const me = people.find((p) => p.id === meId)
  if (!me) return []
  const result: { person: T; relation: Relation }[] = []
  for (const p of people) {
    if (p.id === me.id) continue
    if (p.id === me.manager_id) result.push({ person: p, relation: 'руководитель' })
    else if (me.manager_id != null && p.manager_id === me.manager_id && (p.role === me.role || p.unit_id === me.unit_id)) {
      result.push({ person: p, relation: 'коллега' })
    }
    else if (p.manager_id === me.id) result.push({ person: p, relation: 'подчинённый' })
  }
  return result
}
