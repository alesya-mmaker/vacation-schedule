// Удаление сотрудника: база удаляет его заявки и сообщения, очищает ссылки на него у других,
// а пересчёт правил снимает нарушения, которые были из-за него.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Employee, Rule, Unit, VacationRequest } from '../src/domain/types'
import { buildContext, evaluateRequest, requestColor } from '../src/rules/engine'

let db: PGlite
const sql = (file: string) => readFileSync(`supabase/${file}`, 'utf8')

beforeEach(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  for (const f of ['schema.sql', 'seed.sql', 'migrations/003_hr_login.sql', 'migrations/004_correction_token.sql',
    'migrations/005_request_types.sql', 'migrations/006_delete_employee.sql', 'migrations/006_delete_employee.sql']) {
    await db.exec(sql(f))
  }
})

const rows = async <T>(table: string) =>
  (await db.query<{ j: T }>(`select to_jsonb(t) as j from ${table} t order by 1`)).rows.map((r) => r.j)

async function colorOf(id: number) {
  const [rules, employees, units, requests] = await Promise.all([
    rows<Rule>('rules'), rows<Employee>('employees'), rows<Unit>('units'), rows<VacationRequest>('requests'),
  ])
  const ctx = buildContext(employees, units, requests)
  return requestColor(evaluateRequest(requests.find((r) => r.id === id)!, rules, ctx), rules)
}

const count = async (q: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${q}`)).rows[0].n

describe('удаление сотрудника', () => {
  it('удаляет его заявки, результаты проверок и сообщения ему', async () => {
    // Жуков (НО, id 7): заявка №5 и сообщение о её согласовании
    await db.exec(`insert into rule_results (request_id, rule_id, passed, message) values (5, 3, true, 'ok')`)
    await db.exec('delete from employees where id = 7')
    expect(await count('requests where employee_id = 7')).toBe(0)
    expect(await count('outbox where employee_id = 7')).toBe(0)
    expect(await count('rule_results where request_id = 5')).toBe(0)
  })

  it('у подчинённых очищается руководитель', async () => {
    await db.exec('delete from employees where id = 7')
    const subs = (await db.query<{ manager_id: number | null }>('select manager_id from employees where id in (10, 11)')).rows
    expect(subs).toEqual([{ manager_id: null }, { manager_id: null }])
  })

  it('в чужих заявках, где он заместитель, заместитель становится «не указан»', async () => {
    // Никитин (МПП, id 19) — заместитель в заявках №1 и №3
    await db.exec('delete from employees where id = 19')
    const subs = (await db.query<{ substitute_id: number | null }>('select substitute_id from requests where id in (1, 3) order by id')).rows
    expect(subs).toEqual([{ substitute_id: null }, { substitute_id: null }])
    expect(await colorOf(3)).toBe('red') // теперь «не указан заместитель»
  })

  it('пересчёт снимает нарушение, которое было из-за удалённого', async () => {
    // Кузнецова (№4) пересекается с согласованным отпуском своего НО Жукова
    expect(await colorOf(4)).toBe('red')
    await db.exec('delete from employees where id = 7')
    expect(await colorOf(4)).toBe('green')
  })

  it('МПП: после удаления одного из троих лимит 2 больше не превышен', async () => {
    expect(await colorOf(3)).toBe('red')
    await db.exec('delete from employees where id = 17') // Зайцев, согласованная заявка №2
    expect(await colorOf(3)).toBe('green')
  })
})
