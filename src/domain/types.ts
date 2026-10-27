// Предметные типы. Не зависят от Supabase: их используют и интерфейс, и модуль правил.

export const ROLES = ['МПП', 'менеджер секции', 'НО', 'РО', 'ЗАВ', 'ЗТВ', 'ИД', 'РО1'] as const
export type Role = (typeof ROLES)[number]

export const UNIT_TYPES = ['дирекция', 'отделение', 'отдел', 'секция'] as const
export type UnitType = (typeof UNIT_TYPES)[number]

// Типы заявлений — справочник в базе (request_types), HR может добавлять новые
export type RequestType = string

export interface RequestTypeRow {
  name: RequestType
  active: boolean
  sort_order: number
}

export const REQUEST_STATUSES = [
  'на рассмотрении',
  'согласована',
  'отклонена',
  'согласована как исключение',
  'заменена',
] as const
export type RequestStatus = (typeof REQUEST_STATUSES)[number]

export const SEVERITIES = ['нарушение', 'предупреждение', 'информация'] as const
export type Severity = (typeof SEVERITIES)[number]

export const TEMPLATE_KINDS = ['отказ', 'согласование', 'исключение'] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

export interface Unit {
  id: number
  name: string
  type: UnitType
  parent_id: number | null
}

export interface Employee {
  id: number
  full_name: string
  personnel_number: string
  role: Role
  unit_id: number
  manager_id: number | null
  active: boolean
}

export interface VacationRequest {
  id: number
  employee_id: number
  type: RequestType
  start_date: string // YYYY-MM-DD
  end_date: string // YYYY-MM-DD, включительно
  substitute_id: number | null
  comment: string | null
  submitted_at: string
  status: RequestStatus
  replaces_request_id: number | null
  status_before_replace: RequestStatus | null
  correction_token: string
  hr_comment: string | null
  decided_at: string | null
  viewed_at: string | null // когда HR впервые открыл заявку; null — «новая»
}

export interface Rule {
  id: number
  name: string
  type: string
  params: Record<string, unknown>
  severity: Severity
  applies_to: RequestType[]
  enabled: boolean
  source: string
  sort_order: number
}

export interface RuleResult {
  request_id: number
  rule_id: number
  passed: boolean
  possible_conflict: boolean
  message: string
}

export interface MessageTemplate {
  id: number
  kind: TemplateKind
  text: string
}

export interface OutboxMessage {
  id: number
  employee_id: number
  request_id: number | null
  kind: TemplateKind
  text: string
  sent_at: string
}
