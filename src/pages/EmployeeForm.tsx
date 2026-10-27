import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import SearchSelect from '../components/SearchSelect'
import { btn, Card, inputCls } from '../components/ui'
import * as api from '../data/api'
import { colleaguesOf } from '../domain/colleagues'
import type { RequestType } from '../domain/types'
import { formatPeriod, lengthDays, localDate, type Period } from '../rules/dates'

// Форма заявления — отдельная страница для сотрудников, работает без входа.
// Сотрудник ничего не проверяет: проверку по правилам делает система для HR.
// Корректировка — по ссылке с кодом из сообщения об отказе: /form?t=<код>.
// По коду база находит сотрудника и прежнее заявление; ФИО подставляется и не меняется.
export default function EmployeeForm() {
  const [params] = useSearchParams()
  const token = params.get('t')

  const [employees, setEmployees] = useState<api.FormEmployee[] | null>(null)
  const [types, setTypes] = useState<RequestType[]>([])
  const [employeeId, setEmployeeId] = useState<number | null>(null)
  const [correction, setCorrection] = useState<api.Correction | null | 'invalid'>(null)
  const [type, setType] = useState<RequestType>('отпуск')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [substituteId, setSubstituteId] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    api.listFormEmployees().then(setEmployees).catch((e: Error) => setError(e.message))
    api.listFormRequestTypes()
      .then((t) => {
        setTypes(t)
        if (t.length > 0 && !t.includes('отпуск')) setType(t[0])
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!token) return
    api.getCorrection(token)
      .then((c) => {
        setCorrection(c ?? 'invalid')
        if (c) setEmployeeId(c.employee_id)
      })
      .catch(() => setCorrection('invalid'))
  }, [token])

  const replaced: Period | null = correction && correction !== 'invalid' ? correction : null

  // Те же границы, что проверяет база: начало не в прошлом, конец не дальше 2 лет
  const today = localDate(new Date().toISOString())
  const lastDay = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`
  const datesInvalid = start !== '' && end !== '' && end < start
  const canSubmit = !busy && employeeId != null && start !== '' && end !== '' && !datesInvalid
  const substitutes = employeeId && employees ? colleaguesOf(employeeId, employees) : []

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (employeeId == null) return
    setBusy(true)
    setError(null)
    try {
      await api.submitRequest({
        employee_id: employeeId,
        type,
        start_date: start,
        end_date: end,
        substitute_id: substituteId,
        comment: comment.trim() || null,
        correction_token: replaced ? token : null,
      })
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      {done ? (
        <Card className="mx-auto max-w-xl text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
          <h1 className="text-lg font-semibold">Заявление принято, HR рассмотрит его</h1>
          <p className="mt-1 text-sm text-slate-500">Ответ придёт сообщением.</p>
        </Card>
      ) : (
        <Card className="mx-auto max-w-xl">
          <h1 className="mb-1 text-xl font-semibold">Заявление на отпуск</h1>
          <p className="mb-5 text-sm text-slate-500">Заполните форму — HR проверит даты и ответит сообщением.</p>

          {replaced && (
            <div className="mb-5 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
              Вы меняете даты заявления на {formatPeriod(replaced)}. После отправки прежнее заявление будет заменено новым.
            </div>
          )}
          {correction === 'invalid' && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Ссылка устарела: даты по этому заявлению уже изменены. Можно подать новое заявление.
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div className="text-sm">
              <span className="mb-1 block font-medium">ФИО</span>
              <SearchSelect
                options={(employees ?? []).map((e) => ({ value: e.id, label: e.full_name }))}
                value={employeeId}
                onChange={(id) => { setEmployeeId(id); setSubstituteId(null) }}
                placeholder={employees ? 'Начните вводить фамилию' : 'Загрузка…'}
                disabled={!employees || replaced != null}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Тип</span>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">С</span>
                <input type="date" className={inputCls} value={start} min={today} max={lastDay} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">По (включительно)</span>
                <input type="date" className={inputCls} value={end} min={start || today} max={lastDay} onChange={(e) => setEnd(e.target.value)} required />
              </label>
            </div>
            {datesInvalid && <p className="text-sm text-red-700">Дата окончания раньше даты начала.</p>}
            {start && end && !datesInvalid && <p className="text-sm text-slate-500">{lengthDays(start, end)} календарных дней</p>}

            <div className="text-sm">
              <span className="mb-1 block font-medium">Кто будет вас заменять</span>
              <SearchSelect
                options={substitutes.map(({ person, relation }) => ({ value: person.id, label: person.full_name, hint: relation }))}
                value={substituteId}
                onChange={setSubstituteId}
                placeholder={employeeId ? 'Руководитель, коллеги или подчинённые' : 'Сначала выберите себя'}
                disabled={!employeeId}
              />
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium">Комментарий</span>
              <textarea rows={2} maxLength={1000} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>

            {error && <p className="text-sm text-red-700">{error}</p>}
            <button type="submit" className={`${btn.primary} w-full`} disabled={!canSubmit}>{busy ? 'Отправляем…' : 'Отправить заявление'}</button>
          </form>
        </Card>
      )}
    </div>
  )
}
