// Сообщения сотрудникам по шаблонам. Подстановки: {ФИО}, {даты}, {причина}, {ссылка}
import { formatPeriod } from '../rules/dates'
import type { Employee, RequestStatus, TemplateKind, VacationRequest } from './types'

export const TEMPLATE_KIND_BY_DECISION: Partial<Record<RequestStatus, TemplateKind>> = {
  'согласована': 'согласование',
  'отклонена': 'отказ',
  'согласована как исключение': 'исключение',
}

// Ссылка на форму корректировки. Вместо номеров — случайный код заявки: его не подобрать,
// а по нему база сама находит сотрудника и прежнее заявление.
export const correctionLink = (req: VacationRequest, origin: string) => `${origin}/form?t=${req.correction_token}`

export function renderTemplate(
  template: string,
  values: { employee: Employee; request: VacationRequest; reason?: string; link?: string },
) {
  return template
    .replaceAll('{ФИО}', values.employee.full_name)
    .replaceAll('{даты}', formatPeriod(values.request))
    .replaceAll('{причина}', values.reason ?? '')
    .replaceAll('{ссылка}', values.link ?? '')
}
