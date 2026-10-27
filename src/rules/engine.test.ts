// Тесты модуля правил: по нескольку случаев на каждый тип правила.
import { describe, expect, it } from 'vitest'
import type { Employee, Rule, Unit, VacationRequest } from '../domain/types'
import { buildContext, evaluateRequest, requestColor } from './engine'

// ── Маленькая оргструктура для тестов ────────────────────────
const units: Unit[] = [
  { id: 1, name: 'Дирекция', type: 'дирекция', parent_id: null },
  { id: 2, name: 'Отделение А', type: 'отделение', parent_id: 1 },
  { id: 3, name: 'Отдел 1', type: 'отдел', parent_id: 2 },
  { id: 4, name: 'Отдел 2', type: 'отдел', parent_id: 2 },
  { id: 5, name: 'Секция 1.1', type: 'секция', parent_id: 3 },
  { id: 6, name: 'Секция 1.2', type: 'секция', parent_id: 3 },
  { id: 7, name: 'Секция 2.1', type: 'секция', parent_id: 4 },
  { id: 8, name: 'Продажи', type: 'отдел', parent_id: 1 },
]
const emp = (id: number, role: Employee['role'], unit_id: number, manager_id: number | null, active = true): Employee => ({
  id, full_name: `Сотрудник ${id}`, personnel_number: String(id), role, unit_id, manager_id, active,
})
const employees: Employee[] = [
  emp(1, 'ИД', 1, null),
  emp(2, 'ЗАВ', 1, 1),
  emp(3, 'ЗТВ', 1, 1),
  emp(4, 'РО', 2, 2),
  emp(5, 'РО', 2, 2),
  emp(6, 'РО', 2, 3),
  emp(7, 'НО', 3, 4),
  emp(8, 'НО', 4, 4),
  emp(9, 'менеджер секции', 5, 7),
  emp(10, 'менеджер секции', 6, 7),
  emp(11, 'менеджер секции', 7, 8),
  emp(21, 'МПП', 8, 2),
  emp(22, 'МПП', 8, 2),
  emp(23, 'МПП', 8, 2),
  emp(24, 'МПП', 8, 2),
  emp(30, 'МПП', 8, 2, false),
]

let nextId = 100
const req = (employee_id: number, start_date: string, end_date: string, extra: Partial<VacationRequest> = {}): VacationRequest => ({
  id: nextId++, employee_id, type: 'отпуск', start_date, end_date, substitute_id: 24, comment: null,
  submitted_at: '2026-10-01T10:00:00+03:00', status: 'на рассмотрении', replaces_request_id: null,
  status_before_replace: null, correction_token: '', hr_comment: null, decided_at: null, viewed_at: null, ...extra,
})
const approved = { status: 'согласована' as const }

const ALL_TYPES: Rule['applies_to'] = ['отпуск', 'без сохранения з/п', 'плановое лечение']
const rule = (type: string, params: Record<string, unknown>, extra: Partial<Rule> = {}): Rule => ({
  id: 1, name: type, type, params, severity: 'нарушение', applies_to: ALL_TYPES, enabled: true, source: '', sort_order: 0, ...extra,
})

// Проверить одну заявку по одному правилу на фоне других заявок
function check(r: Rule, target: VacationRequest, others: VacationRequest[] = []) {
  const ctx = buildContext(employees, units, [target, ...others])
  return evaluateRequest(target, [r], ctx)[0]
}

// ── group_limit ──────────────────────────────────────────────
describe('group_limit — не более N сотрудников роли одновременно', () => {
  const limit2 = rule('group_limit', { role: 'МПП', max: 2 })
  const a = req(21, '2027-03-01', '2027-03-14', approved)
  const b = req(22, '2027-03-08', '2027-03-21', approved)

  it('третий МПП в те же дни нарушает лимит 2', () => {
    const r = check(limit2, req(23, '2027-03-10', '2027-03-23'), [a, b])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('3 МПП при лимите 2')
    expect(r.message).toContain('Сотрудник 21')
  })
  it('для графика возвращает только дни сверх лимита и тех, кто в эти дни в отпуске', () => {
    const r = check(limit2, req(23, '2027-03-10', '2027-03-23'), [a, b])
    expect(r.conflicts).toEqual([
      { request_id: a.id, start_date: '2027-03-10', end_date: '2027-03-14' },
      { request_id: b.id, start_date: '2027-03-10', end_date: '2027-03-14' },
    ])
  })
  it('лимит 0: нельзя никому, сообщение без пустого списка', () => {
    const r = check({ ...limit2, params: { role: 'МПП', max: 0 } }, req(23, '2027-05-10', '2027-05-23'))
    expect(r.passed).toBe(false)
    expect(r.message).toBe('В отдельные дни в отпуске будет 1 МПП при лимите 0.')
  })
  it('с лимитом 3 та же заявка проходит', () => {
    const r = check({ ...limit2, params: { role: 'МПП', max: 3 } }, req(23, '2027-03-10', '2027-03-23'), [a, b])
    expect(r.passed).toBe(true)
  })
  it('считается одновременность по дням, а не общее число пересечений', () => {
    // a и c не пересекаются друг с другом, поэтому в любой день максимум двое
    const c = req(22, '2027-03-15', '2027-03-20', approved)
    expect(check(limit2, req(23, '2027-03-10', '2027-03-18'), [a, c]).passed).toBe(true)
  })
  it('заявки на рассмотрении дают «возможный конфликт», а не нарушение', () => {
    const r = check(limit2, req(23, '2027-03-10', '2027-03-23'), [a, { ...b, status: 'на рассмотрении' }])
    expect(r).toMatchObject({ passed: true, possible_conflict: true })
  })
  it('исключение не делает нарушителями уже согласованные заявки, но учитывается для новых', () => {
    const exception = req(23, '2027-03-05', '2027-03-12', { status: 'согласована как исключение' })
    // a и b были согласованы до исключения — остаются без нарушения
    expect(check(limit2, a, [b, exception]).passed).toBe(true)
    // новая заявка четвёртого МПП в эти дни — нарушение, исключение занимает место
    expect(check(limit2, req(24, '2027-03-06', '2027-03-10'), [a, b, exception]).passed).toBe(false)
    // само исключение по-прежнему показывает своё нарушение
    expect(check(limit2, exception, [a, b]).passed).toBe(false)
  })
  it('у согласованной заявки возможные конфликты не показываются', () => {
    const r = check(limit2, { ...req(23, '2027-03-10', '2027-03-23'), status: 'согласована' }, [a, { ...b, status: 'на рассмотрении' }])
    expect(r).toMatchObject({ passed: true, possible_conflict: false })
  })
  it('отклонённые заявки не учитываются', () => {
    expect(check(limit2, req(23, '2027-03-10', '2027-03-23'), [a, { ...b, status: 'отклонена' }]).passed).toBe(true)
  })
  it('не применяется к другим ролям', () => {
    expect(check(limit2, req(7, '2027-03-10', '2027-03-23'), [a, b])).toBeUndefined()
  })
})

// ── role_conflict ────────────────────────────────────────────
describe('role_conflict — нельзя одновременно с коллегами, руководителем, подчинёнными', () => {
  const ms = rule('role_conflict', { role: 'менеджер секции', peers: 'отдел', manager: true, subordinates: [] })
  const ro = rule('role_conflict', { role: 'РО', peers: 'manager', manager: true, subordinates: [] })
  const id = rule('role_conflict', { role: 'ИД', peers: null, manager: false, subordinates: ['ЗАВ', 'ЗТВ'] })

  it('менеджер секции: конфликт с НО своего отдела', () => {
    const r = check(ms, req(9, '2027-04-05', '2027-04-18'), [req(7, '2027-04-12', '2027-04-25', approved)])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('Сотрудник 7 (НО')
    expect(r.conflicts).toEqual([{ request_id: expect.any(Number), start_date: '2027-04-12', end_date: '2027-04-18' }])
  })
  it('менеджер секции: конфликт с менеджером секции того же отдела, но не другого', () => {
    expect(check(ms, req(9, '2027-04-05', '2027-04-18'), [req(10, '2027-04-10', '2027-04-20', approved)]).passed).toBe(false)
    expect(check(ms, req(9, '2027-04-05', '2027-04-18'), [req(11, '2027-04-10', '2027-04-20', approved)]).passed).toBe(true)
  })
  it('РО: конфликт с РО того же ЗАВ и с самим ЗАВ, но не с РО другого руководителя', () => {
    expect(check(ro, req(4, '2027-05-01', '2027-05-14'), [req(5, '2027-05-10', '2027-05-20', approved)]).passed).toBe(false)
    expect(check(ro, req(4, '2027-05-01', '2027-05-14'), [req(2, '2027-05-10', '2027-05-20', approved)]).passed).toBe(false)
    expect(check(ro, req(4, '2027-05-01', '2027-05-14'), [req(6, '2027-05-10', '2027-05-20', approved)]).passed).toBe(true)
  })
  it('ИД: конфликт с ЗАВ', () => {
    const r = check(id, req(1, '2027-05-10', '2027-05-23'), [req(2, '2027-05-17', '2027-05-30', approved)])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('ЗАВ')
  })
  it('если ни с кем не задано — правило не применяется', () => {
    const empty = rule('role_conflict', { role: 'ИД', peers: null, manager: false, subordinates: [] })
    expect(check(empty, req(1, '2027-05-10', '2027-05-23'))).toBeUndefined()
  })
  it('без пересечений — выполнено', () => {
    expect(check(id, req(1, '2027-05-10', '2027-05-23'), [req(2, '2027-06-01', '2027-06-14', approved)]).passed).toBe(true)
  })
})

// ── advance_notice ───────────────────────────────────────────
describe('advance_notice — заявление не позднее чем за N дней', () => {
  const r30 = rule('advance_notice', { min_days: 30 })
  it('за 30 дней — выполнено', () => {
    expect(check(r30, req(9, '2027-01-31', '2027-02-13', { submitted_at: '2027-01-01T10:00:00+03:00' })).passed).toBe(true)
  })
  it('за 29 дней — нарушение', () => {
    const r = check(r30, req(9, '2027-01-30', '2027-02-12', { submitted_at: '2027-01-01T10:00:00+03:00' }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('за 29 дн.')
  })
  it('дата подачи берётся по времени Минска', () => {
    // 31.12.2026 22:30 UTC — это уже 01.01.2027 по Минску
    const r = check(r30, req(9, '2027-01-31', '2027-02-13', { submitted_at: '2026-12-31T22:30:00Z' }))
    expect(r.message).toContain('за 30 дн.')
  })
})

// ── substitute_required ──────────────────────────────────────
describe('substitute_required — заместитель указан и не в отпуске', () => {
  const sub = rule('substitute_required', {})
  it('без заместителя — нарушение', () => {
    expect(check(sub, req(21, '2027-03-01', '2027-03-14', { substitute_id: null })).message).toBe('Не указан заместитель.')
  })
  it('заместитель сам в отпуске — нарушение', () => {
    const r = check(sub, req(21, '2027-03-01', '2027-03-14', { substitute_id: 22 }), [req(22, '2027-03-10', '2027-03-20', approved)])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('Сотрудник 22')
  })
  it('уволенный заместитель — нарушение', () => {
    expect(check(sub, req(21, '2027-03-01', '2027-03-14', { substitute_id: 30 })).passed).toBe(false)
  })
  it('заместитель свободен — выполнено', () => {
    expect(check(sub, req(21, '2027-03-01', '2027-03-14', { substitute_id: 22 })).passed).toBe(true)
  })
})

// ── reschedule_notice ────────────────────────────────────────
describe('reschedule_notice — перенос согласованного отпуска не позднее чем за N дней', () => {
  const r14 = rule('reschedule_notice', { min_days: 14 })
  const prev = req(9, '2027-03-01', '2027-03-14', { status: 'заменена', status_before_replace: 'согласована' })
  it('перенос за 10 дней до начала прежнего отпуска — нарушение', () => {
    const r = check(r14, req(9, '2027-05-01', '2027-05-14', { replaces_request_id: prev.id, submitted_at: '2027-02-19T10:00:00+03:00' }), [prev])
    expect(r.passed).toBe(false)
    expect(r.message).toContain('за 10 дн.')
  })
  it('перенос за 14 дней — выполнено', () => {
    const r = check(r14, req(9, '2027-05-01', '2027-05-14', { replaces_request_id: prev.id, submitted_at: '2027-02-15T10:00:00+03:00' }), [prev])
    expect(r.passed).toBe(true)
  })
  it('замена отклонённой заявки — не перенос, правило не применяется', () => {
    const rejected = { ...prev, id: nextId++, status_before_replace: 'отклонена' as const }
    expect(check(r14, req(9, '2027-05-01', '2027-05-14', { replaces_request_id: rejected.id, submitted_at: '2027-02-27T10:00:00+03:00' }), [rejected])).toBeUndefined()
  })
  it('обычная заявка — правило не применяется', () => {
    expect(check(r14, req(9, '2027-05-01', '2027-05-14'))).toBeUndefined()
  })
})

// ── season_max_length ────────────────────────────────────────
describe('season_max_length — летом не более N дней', () => {
  const summer = rule('season_max_length', { from: '06-01', to: '08-31', max_days: 14 }, { applies_to: ['отпуск'] })
  it('21 день в июле — нарушение', () => {
    const r = check(summer, req(9, '2027-07-01', '2027-07-21'))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('21 дн.')
  })
  it('ровно 14 дней — выполнено', () => {
    expect(check(summer, req(9, '2027-06-01', '2027-06-14')).passed).toBe(true)
  })
  it('отпуск, захватывающий 31 мая и 1 июня, тоже летний', () => {
    expect(check(summer, req(9, '2027-05-20', '2027-06-09')).passed).toBe(false)
  })
  it('21 день в сентябре — выполнено', () => {
    expect(check(summer, req(9, '2027-09-01', '2027-09-21')).passed).toBe(true)
  })
  it('период через Новый год (25.12–10.01): учитываются дни и до, и после 1 января', () => {
    const ny = rule('season_max_length', { from: '12-25', to: '01-10', max_days: 7 })
    expect(check(ny, req(9, '2026-12-28', '2027-01-08')).passed).toBe(false)
    expect(check(ny, req(9, '2027-01-03', '2027-01-14')).passed).toBe(false)
    expect(check(ny, req(9, '2027-01-11', '2027-01-25')).message).toContain('не попадают')
    expect(check(ny, req(9, '2027-12-20', '2027-12-26')).passed).toBe(true)
  })
  it('не применяется к плановому лечению', () => {
    expect(check(summer, req(9, '2027-07-01', '2027-07-21', { type: 'плановое лечение' }))).toBeUndefined()
  })
})

// ── schedule_deadline ────────────────────────────────────────
describe('schedule_deadline — подано до срока составления графика', () => {
  const deadline = rule('schedule_deadline', { h1_deadline: '01-15', h2_deadline: '07-15' }, { severity: 'предупреждение' })
  it('март, подано до 15 января — выполнено', () => {
    expect(check(deadline, req(9, '2027-03-01', '2027-03-14', { submitted_at: '2027-01-15T18:00:00+03:00' })).passed).toBe(true)
  })
  it('март, подано 16 января — вне графика', () => {
    const r = check(deadline, req(9, '2027-03-01', '2027-03-14', { submitted_at: '2027-01-16T09:00:00+03:00' }))
    expect(r.passed).toBe(false)
    expect(r.message).toContain('Вне графика')
  })
  it('сентябрь, подано в августе — вне графика на 2-е полугодие', () => {
    expect(check(deadline, req(9, '2027-09-01', '2027-09-14', { submitted_at: '2027-08-01T10:00:00+03:00' })).message).toContain('2-е полугодие')
  })
  it('предупреждение даёт жёлтый цвет, а не красный', () => {
    const results = [check(deadline, req(9, '2027-03-01', '2027-03-14', { submitted_at: '2027-02-01T10:00:00+03:00' }))]
    expect(requestColor(results, [deadline])).toBe('yellow')
  })
})

// ── law_min_part ─────────────────────────────────────────────
describe('law_min_part — хотя бы одна часть не менее N дней (ТК РБ ст.174)', () => {
  const part = rule('law_min_part', { min_days: 14 }, { severity: 'предупреждение', applies_to: ['отпуск'] })
  it('две части по 7 дней — предупреждение', () => {
    const r = check(part, req(9, '2027-03-01', '2027-03-07'), [req(9, '2027-06-01', '2027-06-07', approved)])
    expect(r.passed).toBe(false)
  })
  it('есть согласованная часть 14 дней — выполнено', () => {
    expect(check(part, req(9, '2027-03-01', '2027-03-07'), [req(9, '2027-06-01', '2027-06-14', approved)]).passed).toBe(true)
  })
  it('части другого года не учитываются', () => {
    expect(check(part, req(9, '2027-03-01', '2027-03-07'), [req(9, '2026-06-01', '2026-06-14', approved)]).passed).toBe(false)
  })
  it('HR отметил другой тип заявлений — к нему правила об основном отпуске не применяются', () => {
    const broad = { applies_to: ALL_TYPES }
    const unpaid = req(9, '2027-03-01', '2027-03-07', { type: 'без сохранения з/п' })
    expect(check({ ...part, ...broad }, unpaid)).toBeUndefined()
    expect(check(rule('law_annual_total', { norm_days: 24 }, broad), unpaid)).toBeUndefined()
  })
})

// ── law_annual_total ─────────────────────────────────────────
describe('law_annual_total — сколько дней из нормы запланировано (ТК РБ ч.1 ст.155)', () => {
  const total = rule('law_annual_total', { norm_days: 24 }, { severity: 'информация', applies_to: ['отпуск'] })
  it('считает согласованные части и саму заявку, всегда «выполнено»', () => {
    const r = check(total, req(9, '2027-03-01', '2027-03-14'), [
      req(9, '2027-06-01', '2027-06-07', approved),
      req(9, '2027-09-01', '2027-09-07', { status: 'отклонена' }),
    ])
    expect(r.passed).toBe(true)
    expect(r.message).toContain('21 из 24')
  })
})

// ── Общее поведение ──────────────────────────────────────────
describe('движок', () => {
  it('выключенное правило не проверяется', () => {
    const off = rule('advance_notice', { min_days: 30 }, { enabled: false })
    expect(check(off, req(9, '2026-10-05', '2026-10-10'))).toBeUndefined()
  })
  it('цвет: нарушение — красный, возможный конфликт — жёлтый, иначе зелёный', () => {
    const rules = [rule('x', {}, { id: 1 }), rule('y', {}, { id: 2, severity: 'предупреждение' })]
    const base = { request_id: 1, message: '' }
    expect(requestColor([{ ...base, rule_id: 1, passed: false, possible_conflict: false }], rules)).toBe('red')
    expect(requestColor([{ ...base, rule_id: 1, passed: true, possible_conflict: true }], rules)).toBe('yellow')
    expect(requestColor([{ ...base, rule_id: 2, passed: false, possible_conflict: false }], rules)).toBe('yellow')
    expect(requestColor([{ ...base, rule_id: 1, passed: true, possible_conflict: false }], rules)).toBe('green')
  })
  it('невыполненное правило уровня «информация» цвет не меняет', () => {
    const info = [rule('x', {}, { id: 3, severity: 'информация' })]
    expect(requestColor([{ request_id: 1, message: '', rule_id: 3, passed: false, possible_conflict: false }], info)).toBe('green')
  })
})
