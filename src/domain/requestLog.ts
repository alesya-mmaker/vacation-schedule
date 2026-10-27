// Журнал заявки: события по времени. Собирается из того, что уже хранится в базе
// (подача, первое открытие HR, решение, сообщения сотруднику, замена новой заявкой).
import type { OutboxMessage, RequestStatus, VacationRequest } from './types'

export interface LogEvent {
  at: string
  text: string
  note?: string
}

const DECISION_TEXT: Partial<Record<RequestStatus, string>> = {
  'согласована': 'Согласовано',
  'отклонена': 'Отклонено',
  'согласована как исключение': 'Согласовано как исключение',
}

const MESSAGE_TEXT: Record<OutboxMessage['kind'], string> = {
  'отказ': 'Сотруднику отправлено сообщение об отказе',
  'согласование': 'Сотруднику отправлено сообщение о согласовании',
  'исключение': 'Сотруднику отправлено сообщение о согласовании как исключения',
}

export function requestLog(req: VacationRequest, requests: VacationRequest[], outbox: OutboxMessage[]): LogEvent[] {
  const events: LogEvent[] = [
    {
      at: req.submitted_at,
      text: req.replaces_request_id ? `Подано сотрудником — исправление заявления №${req.replaces_request_id}` : 'Подано сотрудником',
    },
  ]
  if (req.viewed_at) events.push({ at: req.viewed_at, text: 'Впервые открыто HR' })

  // Решение: у заменённой заявки статус решения сохранён в «статусе до замены»
  const decision = req.status === 'заменена' ? req.status_before_replace : req.status
  if (req.decided_at && decision && DECISION_TEXT[decision]) {
    events.push({ at: req.decided_at, text: DECISION_TEXT[decision]!, note: req.hr_comment ?? undefined })
  }

  for (const m of outbox) if (m.request_id === req.id) events.push({ at: m.sent_at, text: MESSAGE_TEXT[m.kind] })

  const replacement = requests.find((r) => r.replaces_request_id === req.id)
  if (replacement) events.push({ at: replacement.submitted_at, text: `Заменено новым заявлением №${replacement.id}` })

  // По времени; при равном времени — в порядке добавления (подача → открытие → решение → сообщение)
  return events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i).map(({ e }) => e)
}
