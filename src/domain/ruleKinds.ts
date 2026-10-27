// Виды проверок, из которых HR собирает правила: название, пояснение, параметры по умолчанию
// и автоматическое название правила по параметрам (чтобы название не расходилось с параметрами).
import type { Role, Severity } from './types'

export type Params = Record<string, unknown>

export interface RuleKind {
  title: string
  description: string
  defaultParams: Params
  defaultSeverity: Severity
  vacationOnly?: boolean // по умолчанию применять только к типу «отпуск»
}

export const RULE_KINDS: Record<string, RuleKind> = {
  group_limit: {
    title: 'Лимит одновременно в отпуске',
    description: 'Не больше N сотрудников одной должности в отпуске в один и тот же день.',
    defaultParams: { role: 'МПП', max: 2 },
    defaultSeverity: 'нарушение',
  },
  role_conflict: {
    title: 'Нельзя одновременно с …',
    description: 'Сотрудник должности не уходит в отпуск, если в отпуске коллеги той же должности, его руководитель или подчинённые выбранных должностей.',
    defaultParams: { role: 'НО', peers: null, manager: true, subordinates: [] },
    defaultSeverity: 'нарушение',
  },
  advance_notice: {
    title: 'Срок подачи заявления',
    description: 'Заявление подаётся не позднее чем за N дней до начала.',
    defaultParams: { min_days: 30 },
    defaultSeverity: 'нарушение',
  },
  substitute_required: {
    title: 'Заместитель',
    description: 'Указан заместитель, он работает в компании и сам не в отпуске в эти даты.',
    defaultParams: {},
    defaultSeverity: 'нарушение',
  },
  reschedule_notice: {
    title: 'Срок переноса',
    description: 'Перенос согласованного отпуска — не позднее чем за N дней до его начала.',
    defaultParams: { min_days: 14 },
    defaultSeverity: 'нарушение',
  },
  season_max_length: {
    title: 'Длительность в период',
    description: 'Отпуск, захватывающий период (например, лето), не длиннее N дней.',
    defaultParams: { from: '06-01', to: '08-31', max_days: 14 },
    defaultSeverity: 'нарушение',
    vacationOnly: true,
  },
  schedule_deadline: {
    title: 'Срок графика',
    description: 'Заявление подано до срока составления графика на своё полугодие; позже — «вне графика».',
    defaultParams: { h1_deadline: '01-15', h2_deadline: '07-15' },
    defaultSeverity: 'предупреждение',
    vacationOnly: true,
  },
  law_min_part: {
    title: 'Часть отпуска (закон)',
    description: 'При делении отпуска хотя бы одна часть в году — не менее N дней.',
    defaultParams: { min_days: 14 },
    defaultSeverity: 'предупреждение',
    vacationOnly: true,
  },
  law_annual_total: {
    title: 'Норма отпуска в году (закон)',
    description: 'Сколько дней из годовой нормы запланировано. Только информация, цвет заявки не меняет.',
    defaultParams: { norm_days: 24 },
    defaultSeverity: 'информация',
    vacationOnly: true,
  },
}

export const PEERS_LABEL: Record<string, string> = {
  'отдел': 'своего отдела',
  'отделение': 'своего отделения',
  manager: 'того же руководителя',
}

// «06-01» → «01.06»
export const mmddToText = (v: unknown) => (typeof v === 'string' && v.length === 5 ? `${v.slice(3)}.${v.slice(0, 2)}` : '')

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function ruleName(type: string, p: Params): string {
  switch (type) {
    case 'group_limit':
      return `${capitalize(String(p.role))}: не более ${p.max} в отпуске одновременно`
    case 'role_conflict': {
      const parts: string[] = []
      if (p.peers) parts.push(`другими «${p.role}» ${PEERS_LABEL[String(p.peers)] ?? ''}`.trim())
      if (p.manager) parts.push('своим руководителем')
      const subs = (p.subordinates as Role[] | undefined) ?? []
      if (subs.length > 0) parts.push(subs.join(' и '))
      return `${capitalize(String(p.role))}: не одновременно с ${parts.join(', ') || '— (никого не выбрано)'}`
    }
    case 'advance_notice':
      return `Заявление не позднее чем за ${p.min_days} дн. до начала`
    case 'substitute_required':
      return 'Указан заместитель, и он сам не в отпуске'
    case 'reschedule_notice':
      return `Перенос не позднее чем за ${p.min_days} дн. до начала прежнего отпуска`
    case 'season_max_length':
      return `С ${mmddToText(p.from)} по ${mmddToText(p.to)} не более ${p.max_days} дн.`
    case 'schedule_deadline':
      return `Заявление подано до срока графика (${mmddToText(p.h1_deadline)} и ${mmddToText(p.h2_deadline)})`
    case 'law_min_part':
      return `Хотя бы одна часть отпуска не менее ${p.min_days} дн.`
    case 'law_annual_total':
      return `Основной отпуск не менее ${p.norm_days} календарных дней в году`
    default:
      return type
  }
}
