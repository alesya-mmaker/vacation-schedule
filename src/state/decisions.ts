// Решение HR по заявке: меняем статус и пишем сообщение сотруднику в «Исходящие» — одной операцией
import * as api from '../data/api'
import { TEMPLATE_KIND_BY_DECISION } from '../domain/messages'
import type { VacationRequest } from '../domain/types'

export type Decision = 'согласована' | 'отклонена' | 'согласована как исключение'

export async function decide(req: VacationRequest, decision: Decision, hrComment: string | null, message: string) {
  await api.decideRequest({
    request_id: req.id,
    status: decision,
    hr_comment: hrComment,
    kind: TEMPLATE_KIND_BY_DECISION[decision]!,
    message,
  })
}
