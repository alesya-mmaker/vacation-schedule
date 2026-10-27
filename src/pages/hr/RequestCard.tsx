import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Card, ColorDot, COLOR_LABEL, StatusBadge, btn } from '../../components/ui'
import * as api from '../../data/api'
import { requestLog } from '../../domain/requestLog'
import type { Rule, RuleResult, VacationRequest } from '../../domain/types'
import { formatDate, formatPeriod, lengthDays, localDate } from '../../rules/dates'
import { useAppData } from '../../state/appDataContext'
import type { Decision } from '../../state/decisions'
import DecisionDialog from './DecisionDialog'

const formatTimestamp = (ts: string) => formatDate(localDate(ts))
const timeOfDay = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit' })
const formatDateTime = (ts: string) => `${formatTimestamp(ts)} ${timeOfDay.format(new Date(ts))}`

function ResultIcon({ result, rule }: { result: RuleResult; rule: Rule }) {
  const [sym, cls, label] = result.possible_conflict
    ? ['?', 'bg-amber-100 text-amber-700', 'возможный конфликт']
    : rule.severity === 'информация'
      ? ['i', 'bg-sky-100 text-sky-700', 'информация']
      : result.passed
        ? ['✓', 'bg-emerald-100 text-emerald-700', 'выполнено']
        : rule.severity === 'нарушение'
          ? ['✕', 'bg-red-100 text-red-700', 'нарушение']
          : ['!', 'bg-amber-100 text-amber-700', 'предупреждение']
  return (
    <span title={label} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${cls}`}>{sym}</span>
  )
}

// Вся цепочка корректировок: от самой первой заявки до последней
function correctionChain(req: VacationRequest, requests: VacationRequest[]) {
  let first = req
  for (let prev; (prev = requests.find((r) => r.id === first.replaces_request_id)); ) first = prev
  const chain = [first]
  for (let next; (next = requests.find((r) => r.replaces_request_id === chain[chain.length - 1].id)); ) chain.push(next)
  return chain
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export default function RequestCard() {
  const { id } = useParams()
  // Возврат в список с теми же фильтрами, с которыми его открыли
  const listSearch = (useLocation().state as { listSearch?: string } | null)?.listSearch ?? ''
  const { requests, rules, outbox, employeeById, unitById, resultsByRequest, colorByRequest, reload } = useAppData()
  const [decision, setDecision] = useState<Decision | null>(null)

  const req = requests.find((r) => r.id === Number(id))

  // Первое открытие HR снимает пометку «новая»
  const unseen = req != null && !req.viewed_at
  useEffect(() => {
    if (unseen) void api.markViewed(Number(id)).then(reload)
  }, [unseen, id, reload])

  if (!req) return <p>Заявка №{id} не найдена. <Link className="underline" to="/hr/requests">К списку</Link></p>

  const emp = employeeById.get(req.employee_id)!
  const manager = emp.manager_id != null ? employeeById.get(emp.manager_id) : undefined
  const substitute = req.substitute_id != null ? employeeById.get(req.substitute_id) : undefined
  const color = colorByRequest.get(req.id)!
  const results = resultsByRequest.get(req.id) ?? []
  const ruleById = new Map(rules.map((r) => [r.id, r]))
  const chain = correctionChain(req, requests)
  const isRed = color === 'red'

  return (
    <div className="space-y-4">
      <Link to={`/hr/requests${listSearch}`} state={{ returning: true }} className="text-sm text-slate-500 hover:text-slate-800">← Все заявки</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Заявление №{req.id}</h1>
        <StatusBadge status={req.status} />
        <span className="flex items-center gap-1.5 text-sm text-slate-600"><ColorDot color={color} />{COLOR_LABEL[color]}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-4">
          <Card title="Данные заявления">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Сотрудник">{emp.full_name}</Field>
              <Field label="Должность">{emp.role}</Field>
              <Field label="Подразделение">{unitById.get(emp.unit_id)?.name}</Field>
              <Field label="Руководитель">{manager ? `${manager.full_name} (${manager.role})` : '—'}</Field>
              <Field label="Тип">{req.type}</Field>
              <Field label="Даты">{formatPeriod(req)} · {lengthDays(req.start_date, req.end_date)} дн.</Field>
              <Field label="Заместитель">{substitute ? `${substitute.full_name} (${substitute.role})` : 'не указан'}</Field>
              <Field label="Подано">{formatTimestamp(req.submitted_at)}</Field>
              {req.comment && <div className="col-span-2"><Field label="Комментарий сотрудника">{req.comment}</Field></div>}
              {req.decided_at && <Field label="Решение HR">{formatTimestamp(req.decided_at)}</Field>}
              {req.hr_comment && <Field label="Комментарий HR">{req.hr_comment}</Field>}
            </dl>
          </Card>

          {req.status === 'на рассмотрении' && (
            <Card title="Решение">
              <div className="flex flex-wrap gap-2">
                <button className={btn.green} disabled={isRed} onClick={() => setDecision('согласована')}>Согласовать</button>
                <button className={btn.red} onClick={() => setDecision('отклонена')}>Отклонить</button>
                <button className={btn.violet} onClick={() => setDecision('согласована как исключение')}>Согласовать как исключение</button>
              </div>
              {isRed && <p className="mt-2 text-xs text-slate-500">Есть нарушения: обычное согласование недоступно, только как исключение с комментарием.</p>}
            </Card>
          )}

          <Card title="Журнал">
            <ol className="space-y-2 border-l border-slate-200 pl-4">
              {requestLog(req, requests, outbox).map((e, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                  <span className="mr-2 whitespace-nowrap text-xs text-slate-500">{formatDateTime(e.at)}</span>
                  {e.text}
                  {e.note && <div className="text-xs text-slate-500">«{e.note}»</div>}
                </li>
              ))}
            </ol>
          </Card>

          {chain.length > 1 && (
            <Card title="История корректировок">
              <ol className="space-y-2">
                {chain.map((r) => (
                  <li key={r.id} className={`rounded-lg border p-3 text-sm ${r.id === req.id ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      {r.id === req.id
                        ? <span className="font-medium">№{r.id} (эта заявка)</span>
                        : <Link to={`/hr/requests/${r.id}`} state={{ listSearch }} className="font-medium text-sky-700 underline">№{r.id}</Link>}
                      <span>{formatPeriod(r)}</span>
                      <StatusBadge status={r.status} />
                      {r.status_before_replace && <span className="text-xs text-slate-500">(до замены: {r.status_before_replace})</span>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Подано {formatTimestamp(r.submitted_at)}{r.hr_comment && ` · HR: ${r.hr_comment}`}
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>

        <Card title="Проверка по правилам">
          <ul className="divide-y divide-slate-100">
            {results.map((res) => {
              const rule = ruleById.get(res.rule_id)!
              return (
                <li key={res.rule_id} className="flex gap-3 py-3">
                  <ResultIcon result={res} rule={rule} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{rule.name}</div>
                    <div className="text-sm text-slate-600">{res.message}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{rule.source}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      {decision && <DecisionDialog request={req} decision={decision} onClose={() => setDecision(null)} />}
    </div>
  )
}
