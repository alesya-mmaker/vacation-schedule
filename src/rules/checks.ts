// Проверки по типам правил. Каждая проверка получает заявку, параметры правила и контекст
// (все сотрудники, подразделения, заявки) и возвращает результат или null, если правило
// к этой заявке не относится (например, правило для МПП и заявка НО).
//
// Сравнение идёт с согласованными заявками (в т.ч. исключениями). Пересечения заявки
// на рассмотрении с другими заявками на рассмотрении — не нарушение, а «возможный конфликт».

import type { Employee, Rule, Unit, UnitType, VacationRequest } from '../domain/types'
import { addDays, covers, daysBetween, eachDay, formatDate, formatPeriod, lengthDays, localDate, overlaps, type Period } from './dates'

export interface RuleContext {
  employees: Map<number, Employee>
  units: Map<number, Unit>
  requests: VacationRequest[]
}

export interface CheckOutcome {
  passed: boolean
  possible_conflict: boolean
  message: string
  // дни, в которые правило нарушено, и согласованные заявки, из-за которых (для подсветки на графике)
  conflicts: Conflict[]
}

export interface Conflict extends Period {
  request_id: number
}

export type Check = (req: VacationRequest, rule: Rule, ctx: RuleContext) => CheckOutcome | null

const APPROVED = ['согласована', 'согласована как исключение']
const isApproved = (r: VacationRequest) => APPROVED.includes(r.status)
const isPending = (r: VacationRequest) => r.status === 'на рассмотрении'

const ok = (message: string): CheckOutcome => ({ passed: true, possible_conflict: false, message, conflicts: [] })
const fail = (message: string, conflicts: Conflict[] = []): CheckOutcome => ({ passed: false, possible_conflict: false, message, conflicts })
const maybe = (message: string): CheckOutcome => ({ passed: true, possible_conflict: true, message, conflicts: [] })

// Общие дни двух периодов (считается только для пересекающихся)
const intersection = (a: Period, b: Period): Period => ({
  start_date: a.start_date > b.start_date ? a.start_date : b.start_date,
  end_date: a.end_date < b.end_date ? a.end_date : b.end_date,
})

function describe(r: VacationRequest, ctx: RuleContext) {
  const e = ctx.employees.get(r.employee_id)
  return `${e?.full_name ?? '?'} (${e?.role ?? '?'}, ${formatPeriod(r)})`
}
const describeAll = (list: VacationRequest[], ctx: RuleContext) => list.map((r) => describe(r, ctx)).join('; ')

// Заявки указанных сотрудников, пересекающиеся с req: отдельно согласованные и на рассмотрении.
// Возможные конфликты показываем только у заявок на рассмотрении: по уже решённым они только путают.
// Исключение, разрешённое HR, не делает нарушителями уже решённые заявки других сотрудников,
// но для новых заявок (на рассмотрении) учитывается как обычный согласованный отпуск.
function overlapping(req: VacationRequest, employeeIds: Set<number>, ctx: RuleContext) {
  const hits = ctx.requests.filter(
    (r) => r.id !== req.id && employeeIds.has(r.employee_id) && overlaps(r, req),
  )
  const counts = (r: VacationRequest) => isApproved(r) && (isPending(req) || r.status !== 'согласована как исключение')
  return { approved: hits.filter(counts), pending: isPending(req) ? hits.filter(isPending) : [] }
}

// Общий вывод для правил «нельзя одновременно с …»
function conflictOutcome(req: VacationRequest, employeeIds: Set<number>, ctx: RuleContext, okMessage: string) {
  const { approved, pending } = overlapping(req, employeeIds, ctx)
  if (approved.length > 0) {
    const also = pending.length > 0 ? ` Также на рассмотрении: ${describeAll(pending, ctx)}.` : ''
    return fail(
      `В эти даты в отпуске: ${describeAll(approved, ctx)}.${also}`,
      approved.map((r) => ({ request_id: r.id, ...intersection(req, r) })),
    )
  }
  if (pending.length > 0) return maybe(`Возможный конфликт с заявками на рассмотрении: ${describeAll(pending, ctx)}.`)
  return ok(okMessage)
}

function ancestorOfType(unitId: number, type: UnitType, ctx: RuleContext): number | null {
  for (let u = ctx.units.get(unitId); u; u = u.parent_id != null ? ctx.units.get(u.parent_id) : undefined) {
    if (u.type === type) return u.id
  }
  return null
}

// Сколько человек из списка заявок (плюс сама заявка) в отпуске одновременно — максимум по дням
function maxConcurrent(req: VacationRequest, others: VacationRequest[]) {
  let max = 0
  for (const day of eachDay(req)) {
    const count = 1 + new Set(others.filter((r) => covers(r, day)).map((r) => r.employee_id)).size
    max = Math.max(max, count)
  }
  return max
}

// Части основного отпуска сотрудника в году начала заявки: согласованные плюс сама заявка.
// Правила ТК об основном отпуске к другим типам заявлений не относятся, даже если HR их отметил.
function vacationParts(req: VacationRequest, ctx: RuleContext) {
  const year = req.start_date.slice(0, 4)
  const parts = ctx.requests.filter(
    (r) =>
      r.employee_id === req.employee_id &&
      r.type === 'отпуск' &&
      r.start_date.slice(0, 4) === year &&
      (r.id === req.id || isApproved(r)),
  )
  return { year, parts }
}

// ── Типы правил ──────────────────────────────────────────────

// Не более N сотрудников роли одновременно (п.1, МПП)
const group_limit: Check = (req, rule, ctx) => {
  const { role, max } = rule.params as { role: string; max: number }
  if (ctx.employees.get(req.employee_id)?.role !== role) return null

  const sameRole = new Set([...ctx.employees.values()].filter((e) => e.role === role && e.id !== req.employee_id).map((e) => e.id))
  const { approved, pending } = overlapping(req, sameRole, ctx)
  const withApproved = maxConcurrent(req, approved)
  if (withApproved > max) {
    // Подсвечиваем только дни сверх лимита и тех, кто в эти дни в отпуске
    const conflicts: Conflict[] = []
    const current = new Map<number, Conflict>() // последний отрезок по каждой заявке
    for (const day of eachDay(req)) {
      const present = approved.filter((r) => covers(r, day))
      if (1 + new Set(present.map((r) => r.employee_id)).size <= max) continue
      for (const r of present) {
        const seg = current.get(r.id)
        if (seg && addDays(seg.end_date, 1) === day) seg.end_date = day
        else {
          const next = { request_id: r.id, start_date: day, end_date: day }
          conflicts.push(next)
          current.set(r.id, next)
        }
      }
    }
    const already = approved.length > 0 ? ` Уже согласованы: ${describeAll(approved, ctx)}.` : ''
    return fail(`В отдельные дни в отпуске будет ${withApproved} ${role} при лимите ${max}.${already}`, conflicts)
  }
  if (maxConcurrent(req, [...approved, ...pending]) > max) {
    return maybe(`Лимит ${max} будет превышен, если согласовать заявки на рассмотрении: ${describeAll(pending, ctx)}.`)
  }
  return ok(`Одновременно в отпуске не более ${withApproved} ${role} при лимите ${max}.`)
}

// Нельзя одновременно с коллегами той же роли, руководителем, подчинёнными (п.1)
const role_conflict: Check = (req, rule, ctx) => {
  const { role, peers, manager, subordinates = [] } = rule.params as {
    role: string
    peers: 'отдел' | 'отделение' | 'manager' | null
    manager: boolean
    subordinates?: string[]
  }
  const emp = ctx.employees.get(req.employee_id)
  if (!emp || emp.role !== role) return null
  if (!peers && !manager && subordinates.length === 0) return null // ни с кем не задано — проверять нечего

  const ids = new Set<number>()
  const groups: string[] = []
  if (peers) {
    const myScope = peers === 'manager' ? emp.manager_id : ancestorOfType(emp.unit_id, peers, ctx)
    for (const e of ctx.employees.values()) {
      if (e.id === emp.id || e.role !== role) continue
      const scope = peers === 'manager' ? e.manager_id : ancestorOfType(e.unit_id, peers, ctx)
      if (myScope != null && scope === myScope) ids.add(e.id)
    }
    groups.push(peers === 'manager' ? `другие ${role} того же руководителя` : `другие ${role} своего подразделения (${peers})`)
  }
  if (manager && emp.manager_id != null) {
    ids.add(emp.manager_id)
    groups.push(`руководитель (${ctx.employees.get(emp.manager_id)?.role ?? '?'})`)
  }
  if (subordinates.length > 0) {
    for (const e of ctx.employees.values()) if (e.manager_id === emp.id && subordinates.includes(e.role)) ids.add(e.id)
    groups.push(subordinates.join(', '))
  }
  return conflictOutcome(req, ids, ctx, `Не в отпуске: ${groups.join('; ')}.`)
}

// Заявление не позднее чем за N дней до начала (п.2)
const advance_notice: Check = (req, rule) => {
  const { min_days } = rule.params as { min_days: number }
  const days = daysBetween(localDate(req.submitted_at), req.start_date)
  const text = `Подано за ${days} дн. до начала, нужно не менее чем за ${min_days}.`
  return days >= min_days ? ok(text) : fail(text)
}

// Указан заместитель, и он не в отпуске в эти даты (п.2)
const substitute_required: Check = (req, _rule, ctx) => {
  if (req.substitute_id == null) return fail('Не указан заместитель.')
  if (req.substitute_id === req.employee_id) return fail('Сотрудник указал заместителем самого себя.')
  const sub = ctx.employees.get(req.substitute_id)
  if (!sub) return fail('Заместитель не найден в списке сотрудников.')
  if (!sub.active) return fail(`Заместитель ${sub.full_name} больше не работает в компании.`)
  return conflictOutcome(req, new Set([sub.id]), ctx, `Заместитель: ${sub.full_name}, в эти даты не в отпуске.`)
}

// Перенос согласованного отпуска не позднее чем за N дней до его начала (п.5)
const reschedule_notice: Check = (req, rule, ctx) => {
  if (req.replaces_request_id == null) return null
  const prev = ctx.requests.find((r) => r.id === req.replaces_request_id)
  const prevStatus = prev?.status === 'заменена' ? prev.status_before_replace : prev?.status
  if (!prev || !prevStatus || !APPROVED.includes(prevStatus)) return null

  const { min_days } = rule.params as { min_days: number }
  const days = daysBetween(localDate(req.submitted_at), prev.start_date)
  const text = `Перенос отпуска ${formatPeriod(prev)} подан за ${days} дн. до его начала, нужно не менее чем за ${min_days}.`
  return days >= min_days ? ok(text) : fail(text)
}

// Отпуск в заданный период (лето) не длиннее N дней (п.6)
const season_max_length: Check = (req, rule) => {
  const { from, to, max_days } = rule.params as { from: string; to: string; max_days: number }
  // Период может переходить через Новый год (например, 25.12–10.01): тогда он заканчивается в следующем году
  const crossesYear = from > to
  const startYear = +req.start_date.slice(0, 4)
  const inSeason = [startYear - 1, startYear, startYear + 1].some((y) =>
    overlaps(req, { start_date: `${y}-${from}`, end_date: `${crossesYear ? y + 1 : y}-${to}` }),
  )
  const length = lengthDays(req.start_date, req.end_date)
  const period = `${formatDate(`2000-${from}`).slice(0, 5)}–${formatDate(`2000-${to}`).slice(0, 5)}`
  if (!inSeason) return ok(`Даты не попадают в период ${period}.`)
  const text = `Отпуск в период ${period}: ${length} дн., допускается не более ${max_days}.`
  return length <= max_days ? ok(text) : fail(text)
}

// Заявление подано до срока составления графика на полугодие (п.4)
const schedule_deadline: Check = (req, rule) => {
  const { h1_deadline, h2_deadline } = rule.params as { h1_deadline: string; h2_deadline: string }
  const year = req.start_date.slice(0, 4)
  const firstHalf = +req.start_date.slice(5, 7) <= 6
  const deadline = `${year}-${firstHalf ? h1_deadline : h2_deadline}`
  const submitted = localDate(req.submitted_at)
  const half = firstHalf ? '1-е' : '2-е'
  return submitted <= deadline
    ? ok(`Подано до срока графика на ${half} полугодие (${formatDate(deadline)}).`)
    : fail(`Вне графика: подано ${formatDate(submitted)}, срок графика на ${half} полугодие — ${formatDate(deadline)}.`)
}

// ТК РБ ст.174: при делении отпуска одна часть не менее N дней
const law_min_part: Check = (req, rule, ctx) => {
  const { min_days } = rule.params as { min_days: number }
  if (req.type !== 'отпуск') return null
  const { year, parts } = vacationParts(req, ctx)
  const longest = Math.max(...parts.map((p) => lengthDays(p.start_date, p.end_date)))
  return longest >= min_days
    ? ok(`В ${year} году есть часть отпуска не менее ${min_days} дн. (самая длинная — ${longest}).`)
    : fail(`В ${year} году ни одна часть отпуска не достигает ${min_days} дн. (самая длинная — ${longest}).`)
}

// ТК РБ ч.1 ст.155: основной отпуск не менее N дней в году. Только информация.
const law_annual_total: Check = (req, rule, ctx) => {
  const { norm_days } = rule.params as { norm_days: number }
  if (req.type !== 'отпуск') return null
  const { year, parts } = vacationParts(req, ctx)
  const total = parts.reduce((sum, p) => sum + lengthDays(p.start_date, p.end_date), 0)
  return ok(`Запланировано ${total} из ${norm_days} дн. основного отпуска на ${year} год (с учётом этой заявки).`)
}

export const CHECKS: Record<string, Check> = {
  group_limit,
  role_conflict,
  advance_notice,
  substitute_required,
  reschedule_notice,
  season_max_length,
  schedule_deadline,
  law_min_part,
  law_annual_total,
}
