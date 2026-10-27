// Проверка правил на тестовых данных: загружаем те же schema.sql и seed.sql,
// что и в Supabase, во временную базу PostgreSQL в памяти и сверяем цвета заявок.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Employee, Rule, Unit, VacationRequest } from '../src/domain/types'
import { buildContext, evaluateRequest, requestColor, type RuleContext } from '../src/rules/engine'

let rules: Rule[]
let ctx: RuleContext

beforeAll(async () => {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  for (const file of ['schema.sql', 'seed.sql']) await db.exec(readFileSync(`supabase/${file}`, 'utf8'))
  const rows = async <T>(table: string) =>
    (await db.query<{ j: T }>(`select to_jsonb(t) as j from ${table} t order by id`)).rows.map((r) => r.j)
  rules = await rows<Rule>('rules')
  ctx = buildContext(await rows<Employee>('employees'), await rows<Unit>('units'), await rows<VacationRequest>('requests'))
})

const colorOf = (id: number, withRules = rules) => {
  const req = ctx.requests.find((r) => r.id === id)!
  return requestColor(evaluateRequest(req, withRules, ctx), withRules)
}
const failedRules = (id: number) => {
  const req = ctx.requests.find((r) => r.id === id)!
  return evaluateRequest(req, rules, ctx)
    .filter((r) => !r.passed)
    .map((r) => rules.find((x) => x.id === r.rule_id)!.type)
}

describe('тестовые данные', () => {
  it.each([
    [3, 'red', ['group_limit'], 'третий МПП сверх лимита 2'],
    [4, 'red', ['role_conflict'], 'менеджер секции пересекается с НО своего отдела'],
    [6, 'red', ['role_conflict'], 'ИД пересекается с ЗАВ'],
    [8, 'red', ['season_max_length'], 'летний отпуск 21 день'],
    [9, 'red', ['advance_notice', 'schedule_deadline'], 'подана менее чем за месяц и вне графика'],
    [12, 'red', ['season_max_length'], 'согласованное исключение: нарушение остаётся видно'],
    [13, 'red', ['substitute_required'], 'без заместителя'],
    [5, 'green', [], 'чистая согласованная'],
    [11, 'green', [], 'согласованная корректировка'],
    [14, 'green', [], 'чистая согласованная'],
    [15, 'green', [], 'чистая на рассмотрении'],
  ])('заявка %i: %s (%s) — %s', (id, color, failed) => {
    expect(colorOf(id)).toBe(color)
    expect(failedRules(id)).toEqual(failed)
  })

  it('у согласованных заявок возможные конфликты с заявками на рассмотрении не показываются', () => {
    expect([colorOf(1), colorOf(2), colorOf(7)]).toEqual(['green', 'green', 'green'])
  })

  it('в сообщении о конфликте названы конфликтующие сотрудники', () => {
    const req = ctx.requests.find((r) => r.id === 6)!
    const roleConflict = evaluateRequest(req, rules, ctx).find((r) => !r.passed)!
    expect(roleConflict.message).toContain('Миронова Ольга Викторовна (ЗАВ')
  })
})

describe('сценарий демо', () => {
  it('лимит МПП 2 → 3: красная заявка МПП становится зелёной', () => {
    expect(colorOf(3)).toBe('red')
    const changed = rules.map((r) => (r.type === 'group_limit' ? { ...r, params: { ...r.params, max: 3 } } : r))
    expect(colorOf(3, changed)).toBe('green')
  })
})
