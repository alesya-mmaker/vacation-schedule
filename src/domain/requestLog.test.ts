import { describe, expect, it } from 'vitest'
import { requestLog } from './requestLog'
import type { OutboxMessage, VacationRequest } from './types'

const base: VacationRequest = {
  id: 10, employee_id: 11, type: 'отпуск', start_date: '2027-04-12', end_date: '2027-04-25', substitute_id: 10,
  comment: null, submitted_at: '2026-10-01T07:00:00Z', status: 'заменена', replaces_request_id: null,
  status_before_replace: 'отклонена', correction_token: '', hr_comment: 'В эти даты в отпуске начальник отдела',
  decided_at: '2026-10-08T07:00:00Z', viewed_at: '2026-10-02T07:00:00Z',
}
const next: VacationRequest = { ...base, id: 11, status: 'согласована', replaces_request_id: 10, status_before_replace: null,
  hr_comment: null, submitted_at: '2026-10-09T15:00:00Z', decided_at: '2026-10-12T07:00:00Z', viewed_at: '2026-10-10T07:00:00Z' }
const msg: OutboxMessage = { id: 1, employee_id: 11, request_id: 10, kind: 'отказ', text: '', sent_at: '2026-10-08T07:00:00Z' }

describe('журнал заявки', () => {
  it('цепочка: подана → открыта → отклонена → сообщение → заменена', () => {
    expect(requestLog(base, [base, next], [msg]).map((e) => e.text)).toEqual([
      'Подано сотрудником',
      'Впервые открыто HR',
      'Отклонено',
      'Сотруднику отправлено сообщение об отказе',
      'Заменено новым заявлением №11',
    ])
  })

  it('решение с комментарием HR, исправление ссылается на прежнее заявление', () => {
    expect(requestLog(base, [base, next], [msg])[2].note).toBe('В эти даты в отпуске начальник отдела')
    expect(requestLog(next, [base, next], [])[0].text).toBe('Подано сотрудником — исправление заявления №10')
  })

  it('новая заявка: только подача', () => {
    const fresh = { ...base, status: 'на рассмотрении' as const, viewed_at: null, decided_at: null, hr_comment: null, status_before_replace: null }
    expect(requestLog(fresh, [fresh], []).map((e) => e.text)).toEqual(['Подано сотрудником'])
  })
})
