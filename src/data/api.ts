// Слой доступа к данным. Компоненты и модуль правил работают только через эти функции.
// При переезде с Supabase на свой сервер PostgreSQL заменяется только папка src/data/.
import { supabase, supabaseForm } from './supabaseClient'
import type {
  Employee,
  MessageTemplate,
  OutboxMessage,
  RequestStatus,
  RequestType,
  RequestTypeRow,
  Rule,
  RuleResult,
  TemplateKind,
  Unit,
  VacationRequest,
} from '../domain/types'

function check<T>(table: string, { data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Ошибка базы данных («${table}»): ${error.message}`)
  return data as T
}

async function selectAll<T>(table: string, orderBy = 'id'): Promise<T[]> {
  return check(table, await supabase.from(table).select('*').order(orderBy))
}

export const listUnits = () => selectAll<Unit>('units')
export const listEmployees = () => selectAll<Employee>('employees', 'full_name')
export const listRequests = () => selectAll<VacationRequest>('requests')
export const listRules = () => selectAll<Rule>('rules', 'sort_order')
export const listTemplates = () => selectAll<MessageTemplate>('message_templates')
export const listOutbox = () => selectAll<OutboxMessage>('outbox', 'sent_at')
export const listRequestTypes = async (): Promise<RequestTypeRow[]> =>
  check('request_types', await supabase.from('request_types').select('*').order('sort_order'))

// ── Правила и типы заявлений (редактирует HR) ───────────────

export type RuleInput = Omit<Rule, 'id'>

export async function createRule(rule: RuleInput) {
  check('rules', await supabase.from('rules').insert(rule))
}

export async function updateRule(id: number, patch: Partial<RuleInput>) {
  check('rules', await supabase.from('rules').update(patch).eq('id', id))
}

export async function deleteRule(id: number) {
  check('rules', await supabase.from('rules').delete().eq('id', id))
}

export async function createRequestType(t: RequestTypeRow) {
  check('request_types', await supabase.from('request_types').insert(t))
}

export async function updateRequestType(name: string, patch: Partial<RequestTypeRow>) {
  check('request_types', await supabase.from('request_types').update(patch).eq('name', name))
}

export async function updateTemplate(id: number, text: string) {
  check('message_templates', await supabase.from('message_templates').update({ text }).eq('id', id))
}

export type EmployeeInput = Omit<Employee, 'id'>

export async function createEmployee(e: EmployeeInput) {
  check('employees', await supabase.from('employees').insert(e))
}

// Вместе с сотрудником база удаляет его заявки и сообщения ему (см. migrations/006)
export async function deleteEmployee(id: number) {
  check('employees', await supabase.from('employees').delete().eq('id', id))
}

export async function updateEmployee(id: number, e: Partial<EmployeeInput>) {
  check('employees', await supabase.from('employees').update(e).eq('id', id))
}

// Первое открытие заявки HR: снимает пометку «новая» (только если её ещё никто не открывал)
export async function markViewed(id: number) {
  check('requests', await supabase.from('requests').update({ viewed_at: new Date().toISOString() }).eq('id', id).is('viewed_at', null))
}

// Решение HR: статус и сообщение сотруднику сохраняются вместе и только для заявки «на рассмотрении»
// (migrations/010). Если заявку уже обработали, база отвечает понятным текстом — показываем как есть.
export async function decideRequest(d: { request_id: number; status: RequestStatus; hr_comment: string | null; kind: TemplateKind; message: string }) {
  const res = await supabase.rpc('decide_request', {
    p_request: d.request_id,
    p_status: d.status,
    p_hr_comment: d.hr_comment,
    p_kind: d.kind,
    p_message: d.message,
  })
  if (res.error?.code === 'P0001') throw new Error(res.error.message)
  check('decide_request', res)
}

// Любое изменение заявок в базе (новая из формы, решение другого HR) — через Supabase Realtime (migrations/011)
export function onRequestsChange(callback: () => void) {
  const channel = supabase
    .channel('requests-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'requests' }, () => callback())
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

// ── Вход HR ──────────────────────────────────────────────────

export async function isSignedIn() {
  const { data } = await supabase.auth.getSession()
  return data.session != null
}

export function onAuthChange(callback: (signedIn: boolean) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session != null))
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Неверный email или пароль.' : error.message)
}

export async function signOut() {
  await supabase.auth.signOut()
}

// ── Форма сотрудника (работает без входа) ────────────────────

export type FormEmployee = Pick<Employee, 'id' | 'full_name' | 'manager_id' | 'role' | 'unit_id'>

// Без входа база сама отдаёт только действующие типы (правило доступа), фильтр не нужен
export async function listFormRequestTypes(): Promise<RequestType[]> {
  const rows = check<{ name: string }[]>('request_types', await supabaseForm.from('request_types').select('name').order('sort_order'))
  return rows.map((r) => r.name)
}

export async function listFormEmployees(): Promise<FormEmployee[]> {
  return check('employees', await supabaseForm.from('employees').select('id, full_name, manager_id, role, unit_id').eq('active', true).order('full_name'))
}

export interface Correction {
  employee_id: number
  start_date: string
  end_date: string
}

// По коду из ссылки: чьё заявление и какие были даты; null — ссылка недействительна или уже использована
export async function getCorrection(token: string): Promise<Correction | null> {
  const rows = check<Correction[]>('correction_request', await supabaseForm.rpc('correction_request', { p_token: token }))
  return rows[0] ?? null
}

export interface NewRequest {
  employee_id: number
  type: RequestType
  start_date: string
  end_date: string
  substitute_id: number | null
  comment: string | null
  correction_token: string | null
}

export async function submitRequest(r: NewRequest): Promise<number> {
  const res = await supabaseForm.rpc('submit_request', {
    p_employee: r.employee_id,
    p_type: r.type,
    p_start: r.start_date,
    p_end: r.end_date,
    p_substitute: r.substitute_id,
    p_comment: r.comment,
    p_token: r.correction_token,
  })
  // Проверки базы (migrations/009) — понятный сотруднику текст, показываем как есть
  if (res.error?.code === 'P0001') throw new Error(res.error.message)
  return check('submit_request', res)
}

// Результаты проверки целиком заменяются свежим пересчётом — одной операцией в базе (migrations/010)
export async function replaceRuleResults(results: RuleResult[]) {
  check('replace_rule_results', await supabase.rpc('replace_rule_results', { p_results: results }))
}
