// Модуль проверки правил. Чистые функции: на вход данные, на выход результаты.
// К базе не обращается — сохранение результатов делает слой данных.

import type { Employee, Rule, RuleResult, Unit, VacationRequest } from '../domain/types'
import { CHECKS, type Conflict, type RuleContext } from './checks'

export type { Conflict, RuleContext } from './checks'

export function buildContext(employees: Employee[], units: Unit[], requests: VacationRequest[]): RuleContext {
  return {
    employees: new Map(employees.map((e) => [e.id, e])),
    units: new Map(units.map((u) => [u.id, u])),
    requests,
  }
}

// Результат проверки: строка для базы + заявки, из-за которых правило нарушено (только в памяти, для графика)
export type CheckResult = RuleResult & { conflicts: Conflict[] }

// Чек-лист одной заявки: по строке на каждое включённое и применимое правило
export function evaluateRequest(req: VacationRequest, rules: Rule[], ctx: RuleContext): CheckResult[] {
  const results: CheckResult[] = []
  for (const rule of [...rules].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!rule.enabled || !rule.applies_to.includes(req.type)) continue
    const check = CHECKS[rule.type]
    const outcome = check
      ? check(req, rule, ctx)
      : { passed: false, possible_conflict: false, message: `Неизвестный тип правила «${rule.type}».`, conflicts: [] }
    if (outcome) results.push({ request_id: req.id, rule_id: rule.id, ...outcome })
  }
  return results
}

export function evaluateAll(rules: Rule[], ctx: RuleContext): CheckResult[] {
  return ctx.requests.flatMap((r) => evaluateRequest(r, rules, ctx))
}

export type Color = 'green' | 'yellow' | 'red'

// Красный — есть нарушения; жёлтый — предупреждения или возможные конфликты; зелёный — всё выполнено.
// Правила уровня «информация» на цвет не влияют, даже если не выполнены.
export function requestColor(results: RuleResult[], rules: Rule[]): Color {
  const severity = new Map(rules.map((r) => [r.id, r.severity]))
  const failed = results.filter((r) => !r.passed && severity.get(r.rule_id) !== 'информация')
  if (failed.some((r) => severity.get(r.rule_id) === 'нарушение')) return 'red'
  if (failed.length > 0 || results.some((r) => r.possible_conflict)) return 'yellow'
  return 'green'
}
