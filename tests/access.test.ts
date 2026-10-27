// Доступ и подача заявления: загружаем schema.sql, seed.sql и миграции 003–009
// во временную базу и проверяем, что видит форма без входа (роль anon) и HR (authenticated).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

let db: PGlite
const sql = (file: string) => readFileSync(`supabase/${file}`, 'utf8')

async function as<T>(role: 'anon' | 'authenticated', query: string, params: unknown[] = []) {
  await db.exec(`set role ${role}`)
  try {
    return (await db.query<T>(query, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

beforeAll(async () => {
  db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  await db.exec(sql('schema.sql'))
  await db.exec(sql('seed.sql'))
  // скрипты миграций можно запускать повторно
  for (const file of ['003_hr_login.sql', '003_hr_login.sql', '004_correction_token.sql', '004_correction_token.sql', '005_request_types.sql', '005_request_types.sql', '006_delete_employee.sql', '007_viewed.sql', '007_viewed.sql', '008_form_colleagues.sql', '009_submit_checks.sql', '009_submit_checks.sql']) {
    await db.exec(sql(`migrations/${file}`))
  }
})

const tokenOf = async (id: number) =>
  (await db.query<{ correction_token: string }>('select correction_token from requests where id = $1', [id])).rows[0].correction_token

describe('форма без входа (anon)', () => {
  it('не видит заявки, правила и сообщения', async () => {
    for (const table of ['requests', 'rules', 'outbox', 'rule_results', 'message_templates', 'units']) {
      await expect(as('anon', `select * from ${table}`), table).rejects.toThrow(/permission denied/)
    }
  })

  it('видит работающих сотрудников без табельных номеров', async () => {
    const rows = await as<{ id: number }>('anon', 'select id, full_name, manager_id from employees')
    expect(rows).toHaveLength(20)
    expect(await as('anon', 'select role, unit_id from employees limit 1')).toHaveLength(1)
    await expect(as('anon', 'select personnel_number from employees')).rejects.toThrow(/permission denied/)
  })

  it('не может менять таблицы напрямую', async () => {
    await expect(as('anon', `update requests set status = 'согласована'`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `insert into outbox (employee_id, kind, text) values (1, 'отказ', 'x')`)).rejects.toThrow(/permission denied/)
  })

  it('подаёт заявление через submit_request', async () => {
    const [{ id }] = await as<{ id: number }>('anon',
      `select submit_request(16, 'отпуск', current_date + 30, current_date + 43, 19, '  ', null) as id`)
    const [row] = (await db.query<{ status: string; comment: string | null }>('select status, comment from requests where id = $1', [id])).rows
    expect(row).toEqual({ status: 'на рассмотрении', comment: null })
  })

  it('по коду из ссылки узнаёт сотрудника и прежние даты', async () => {
    const rows = await as<{ employee_id: number }>('anon', 'select * from correction_request($1)', [await tokenOf(13)])
    expect(rows).toHaveLength(1)
    expect(rows[0].employee_id).toBe(20)
  })

  it('корректировка по коду: прежняя заявка «заменена» и помнит прежний статус; ссылка одноразовая', async () => {
    const token = await tokenOf(13)
    const [{ id }] = await as<{ id: number }>('anon',
      `select submit_request(20, 'отпуск', current_date + 60, current_date + 73, 19, null, $1) as id`, [token])
    const rows = (await db.query<{ id: number; status: string; status_before_replace: string | null; replaces_request_id: number | null }>(
      'select id, status, status_before_replace, replaces_request_id from requests where id in (13, $1) order by id', [id])).rows
    expect(rows).toEqual([
      { id: 13, status: 'заменена', status_before_replace: 'на рассмотрении', replaces_request_id: null },
      { id, status: 'на рассмотрении', status_before_replace: null, replaces_request_id: 13 },
    ])
    expect(await as('anon', 'select * from correction_request($1)', [token])).toHaveLength(0)
  })

  it('выдуманный код ничего не находит', async () => {
    expect(await as('anon', `select * from correction_request('00000000-0000-0000-0000-000000000000')`)).toHaveLength(0)
  })

  it('код чужой заявки с другим сотрудником не заменяет её', async () => {
    const [{ id }] = await as<{ id: number }>('anon',
      `select submit_request(1, 'отпуск', current_date + 30, current_date + 43, 3, null, $1) as id`, [await tokenOf(14)])
    const [{ replaces_request_id }] = (await db.query<{ replaces_request_id: number | null }>('select replaces_request_id from requests where id = $1', [id])).rows
    expect(replaces_request_id).toBeNull()
    const [{ status }] = (await db.query<{ status: string }>('select status from requests where id = 14')).rows
    expect(status).toBe('согласована')
  })

  it('старые функции с номерами в ссылке удалены', async () => {
    await expect(as('anon', 'select * from replaceable_request(20, 13)')).rejects.toThrow(/does not exist/)
  })
})

describe('типы заявлений (справочник)', () => {
  it('форма видит только действующие типы', async () => {
    await db.exec(`insert into request_types (name, active, sort_order) values ('учебный отпуск', true, 40), ('донорский день', false, 50)`)
    const rows = await as<{ name: string }>('anon', 'select name from request_types order by sort_order')
    expect(rows.map((r) => r.name)).toEqual(['отпуск', 'без сохранения з/п', 'плановое лечение', 'учебный отпуск'])
  })

  it('фильтр по скрытому полю active форме недоступен — поэтому форма его не использует', async () => {
    await expect(as('anon', 'select name from request_types where active')).rejects.toThrow(/permission denied/)
  })

  it('заявление нового типа подаётся, неизвестного — нет', async () => {
    await as('anon', `select submit_request(16, 'учебный отпуск', current_date + 30, current_date + 43, 19, null, null)`)
    await expect(as('anon', `select submit_request(16, 'выдуманный', current_date + 30, current_date + 43, 19, null, null)`)).rejects.toThrow(/Такого типа заявления нет/)
  })

  it('форма не может менять справочник', async () => {
    await expect(as('anon', `insert into request_types (name) values ('x')`)).rejects.toThrow(/permission denied/)
  })
})

describe('пометка «новая»', () => {
  it('решённые заявки считаются просмотренными, на рассмотрении и новые от формы — нет', async () => {
    const seen = (await db.query<{ id: number; viewed: boolean }>(
      'select id, viewed_at is not null as viewed from requests where id in (1, 3) order by id')).rows
    expect(seen).toEqual([{ id: 1, viewed: true }, { id: 3, viewed: false }])
    const [{ id }] = await as<{ id: number }>('anon', `select submit_request(16, 'отпуск', current_date + 90, current_date + 103, 19, null, null) as id`)
    const [{ viewed_at }] = (await db.query<{ viewed_at: string | null }>('select viewed_at from requests where id = $1', [id])).rows
    expect(viewed_at).toBeNull()
  })
})

describe('проверки при подаче в обход формы', () => {
  const submit = (args: string) => as('anon', `select submit_request(${args}) as id`)

  it('скрытый тип не принимается', async () => {
    await expect(submit(`17, 'донорский день', current_date + 30, current_date + 43, 19, null, null`)).rejects.toThrow(/Такого типа заявления нет/)
  })

  it('заместитель — только «свои», не сам сотрудник', async () => {
    await expect(submit(`17, 'отпуск', current_date + 30, current_date + 43, 17, null, null`)).rejects.toThrow(/Заместителем можно выбрать только/)
    await expect(submit(`17, 'отпуск', current_date + 30, current_date + 43, 10, null, null`)).rejects.toThrow(/Заместителем можно выбрать только/)
    // руководитель и подчинённый подходят
    await submit(`17, 'отпуск', current_date + 30, current_date + 43, 2, null, null`)
    await submit(`2, 'отпуск', current_date + 30, current_date + 43, 5, null, null`)
  })

  it('даты: не в прошлом, не дальше 2 лет, конец не раньше начала', async () => {
    await expect(submit(`17, 'отпуск', current_date - 1, current_date + 10, null, null, null`)).rejects.toThrow(/Дата начала уже прошла/)
    await expect(submit(`17, 'отпуск', current_date + 30, current_date + 800, null, null, null`)).rejects.toThrow(/не больше чем на 2 года/)
    await expect(submit(`17, 'отпуск', current_date + 30, current_date + 20, null, null, null`)).rejects.toThrow(/раньше даты начала/)
  })

  it('комментарий не длиннее 1000 символов', async () => {
    await expect(submit(`17, 'отпуск', current_date + 30, current_date + 43, null, repeat('x', 1001), null`)).rejects.toThrow(/длиннее 1000/)
  })

  it('не больше 5 заявлений от сотрудника за час', async () => {
    for (let i = 0; i < 5; i++) await submit(`18, 'отпуск', current_date + 30, current_date + 43, 19, null, null`)
    await expect(submit(`18, 'отпуск', current_date + 30, current_date + 43, 19, null, null`)).rejects.toThrow(/5 заявлений за последний час/)
  })
})

describe('HR после входа (authenticated)', () => {
  it('читает и меняет всё', async () => {
    expect((await as('authenticated', 'select id from requests')).length).toBeGreaterThan(0)
    await as('authenticated', `update message_templates set text = text where kind = 'отказ'`)
  })
})

// Последним: после него форма закрыта на минуту
describe('общий лимит', () => {
  it('не больше 30 заявлений от всех за минуту', async () => {
    await db.exec(`insert into requests (employee_id, type, start_date, end_date)
      select 5, 'отпуск', current_date + 1, current_date + 2 from generate_series(1, 30)`)
    await expect(as('anon', `select submit_request(19, 'отпуск', current_date + 30, current_date + 43, 20, null, null)`)).rejects.toThrow(/слишком много заявлений/)
  })
})
