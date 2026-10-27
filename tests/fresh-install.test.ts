// Установка с нуля по README: schema.sql → seed.sql → все миграции по номерам — на пустой базе.
import { PGlite } from '@electric-sql/pglite'
import { readdirSync, readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('все SQL-файлы из README выполняются по порядку на пустой базе', async () => {
  const db = new PGlite()
  await db.exec('create role anon; create role authenticated;')
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()
  for (const file of ['schema.sql', 'seed.sql', ...migrations.map((m) => `migrations/${m}`)]) {
    await db.exec(readFileSync(`supabase/${file}`, 'utf8'))
  }
  const count = async (t: string) => (await db.query<{ n: number }>(`select count(*)::int as n from ${t}`)).rows[0].n
  expect([await count('employees'), await count('requests'), await count('rules'), await count('request_types')]).toEqual([20, 15, 14, 3])
})

it('оповещения Realtime: заявки добавляются в публикацию Supabase, повторный запуск не ломается', async () => {
  const db = new PGlite()
  await db.exec(readFileSync('supabase/schema.sql', 'utf8'))
  await db.exec('create publication supabase_realtime')
  const migration = readFileSync('supabase/migrations/011_realtime_requests.sql', 'utf8')
  await db.exec(migration)
  await db.exec(migration)
  const { rows } = await db.query<{ tablename: string }>(`select tablename from pg_publication_tables where pubname = 'supabase_realtime'`)
  expect(rows.map((r) => r.tablename)).toEqual(['requests'])
})
