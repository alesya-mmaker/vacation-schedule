// Действия HR одной операцией в базе (migrations/010): решение по заявке и сохранение результатов проверки.
// Установка как в README: schema.sql → seed.sql → все миграции по номерам.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

let db: PGlite

async function as<T>(role: 'anon' | 'authenticated', query: string, params: unknown[] = []) {
  await db.exec(`set role ${role}`)
  try {
    return (await db.query<T>(query, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

const one = async <T>(query: string, params: unknown[] = []) => (await db.query<T>(query, params)).rows[0]
const outboxCount = async (request: number) => (await one<{ n: number }>('select count(*)::int as n from outbox where request_id = $1', [request])).n
const decide = (request: number, status: string, comment: string | null, kind: string) =>
  as('authenticated', 'select decide_request($1, $2, $3, $4, $5)', [request, status, comment, kind, 'текст сообщения'])

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  for (const file of ['schema.sql', 'seed.sql', ...migrations.map((m) => `migrations/${m}`)]) {
    await db.exec(readFileSync(`supabase/${file}`, 'utf8'))
  }
})

describe('decide_request — решение HR', () => {
  it('меняет статус и пишет сообщение сотруднику вместе', async () => {
    const before = await outboxCount(3)
    await decide(3, 'отклонена', '  в эти даты в отпуске ЗАВ ', 'отказ')
    const row = await one<{ status: string; hr_comment: string; decided: boolean }>(
      'select status, hr_comment, decided_at is not null as decided from requests where id = 3')
    expect(row).toEqual({ status: 'отклонена', hr_comment: 'в эти даты в отпуске ЗАВ', decided: true })
    expect(await outboxCount(3)).toBe(before + 1)
  })

  it('по уже решённой заявке второе решение не принимается и сообщение не пишется', async () => {
    const before = await outboxCount(3)
    await expect(decide(3, 'согласована', null, 'согласование')).rejects.toThrow(/уже обработали/)
    expect((await one<{ status: string }>('select status from requests where id = 3')).status).toBe('отклонена')
    expect(await outboxCount(3)).toBe(before)
  })

  it('заменённую сотрудником заявку согласовать нельзя', async () => {
    const { id } = await one<{ id: number }>(`select id from requests where status = 'заменена' limit 1`)
    await expect(decide(id, 'согласована', null, 'согласование')).rejects.toThrow(/уже обработали/)
    expect((await one<{ status: string }>('select status from requests where id = $1', [id])).status).toBe('заменена')
  })

  it('если сообщение не записалось, статус тоже не меняется', async () => {
    const { id } = await one<{ id: number }>(`select id from requests where status = 'на рассмотрении' order by id limit 1`)
    const before = await outboxCount(id)
    await expect(decide(id, 'согласована', null, 'неизвестный вид')).rejects.toThrow(/check/)
    expect((await one<{ status: string }>('select status from requests where id = $1', [id])).status).toBe('на рассмотрении')
    expect(await outboxCount(id)).toBe(before)
  })

  it('без входа недоступно', async () => {
    await expect(as('anon', `select decide_request(4, 'согласована', null, 'согласование', 'x')`)).rejects.toThrow(/permission denied/)
  })
})

describe('replace_rule_results — сохранение результатов проверки', () => {
  const save = (rows: unknown[]) => as('authenticated', 'select replace_rule_results($1::jsonb)', [JSON.stringify(rows)])
  const count = async () => (await one<{ n: number }>('select count(*)::int as n from rule_results')).n

  it('заменяет все результаты новыми', async () => {
    await save([
      { request_id: 1, rule_id: 1, passed: true, possible_conflict: false, message: 'a' },
      { request_id: 2, rule_id: 1, passed: false, possible_conflict: false, message: 'b' },
    ])
    expect(await count()).toBe(2)
    await save([{ request_id: 1, rule_id: 2, passed: true, possible_conflict: true, message: 'c' }])
    expect(await one('select request_id::int, rule_id::int, possible_conflict, message from rule_results')).toEqual(
      { request_id: 1, rule_id: 2, possible_conflict: true, message: 'c' })
  })

  // Здесь одно соединение, поэтому вызовы идут по очереди; одновременные вкладки разводит блокировка в функции
  it('повторное сохранение тех же результатов не падает на повторе ключа', async () => {
    const rows = [{ request_id: 1, rule_id: 1, passed: true, possible_conflict: false, message: 'a' }]
    await Promise.all([save(rows), save(rows)])
    expect(await count()).toBe(1)
  })

  it('результаты по удалённым заявкам и правилам пропускаются', async () => {
    await save([
      { request_id: 1, rule_id: 1, passed: true, possible_conflict: false, message: 'a' },
      { request_id: 99999, rule_id: 1, passed: true, possible_conflict: false, message: 'нет заявки' },
      { request_id: 1, rule_id: 99999, passed: true, possible_conflict: false, message: 'нет правила' },
    ])
    expect(await count()).toBe(1)
  })

  it('без входа недоступно', async () => {
    await expect(as('anon', `select replace_rule_results('[]'::jsonb)`)).rejects.toThrow(/permission denied/)
  })
})
