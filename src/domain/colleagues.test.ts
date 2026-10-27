import { describe, expect, it } from 'vitest'
import { colleaguesOf } from './colleagues'

// ИД(1) → ЗАВ(2), ЗТВ(3) — все в дирекции (10); ЗАВ → РО(4, отделение 20), МПП(5), МПП(6) (отдел продаж 30); РО → НО(7)
const people = [
  { id: 1, manager_id: null, role: 'ИД' as const, unit_id: 10 },
  { id: 2, manager_id: 1, role: 'ЗАВ' as const, unit_id: 10 },
  { id: 3, manager_id: 1, role: 'ЗТВ' as const, unit_id: 10 },
  { id: 4, manager_id: 2, role: 'РО' as const, unit_id: 20 },
  { id: 5, manager_id: 2, role: 'МПП' as const, unit_id: 30 },
  { id: 6, manager_id: 2, role: 'МПП' as const, unit_id: 30 },
  { id: 7, manager_id: 4, role: 'НО' as const, unit_id: 40 },
]
const ids = (meId: number) => colleaguesOf(meId, people).map(({ person, relation }) => `${person.id}:${relation}`)

describe('«свои» для выбора заместителя', () => {
  it('руководитель, коллеги той же должности и подчинённые', () => {
    expect(ids(5)).toEqual(['2:руководитель', '6:коллега'])
  })
  it('РО другого подразделения у того же руководителя — не коллега для МПП, и наоборот', () => {
    expect(ids(4)).toEqual(['2:руководитель', '7:подчинённый'])
  })
  it('ЗАВ и ЗТВ — коллеги: разные должности, но одно подразделение', () => {
    expect(ids(2)).toContain('3:коллега')
  })
  it('у ИД (без руководителя) — только подчинённые', () => {
    expect(ids(1)).toEqual(['2:подчинённый', '3:подчинённый'])
  })
  it('сам себя в списке нет, чужих подразделений нет', () => {
    expect(ids(7)).toEqual(['4:руководитель'])
  })
})
