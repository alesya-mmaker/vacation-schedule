import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { ColorDot, StatusBadge, inputCls } from '../../components/ui'
import { REQUEST_STATUSES, type VacationRequest } from '../../domain/types'
import { descendants, flattenUnits, indent } from '../../domain/units'
import { formatDate, formatPeriod, lengthDays, localDate } from '../../rules/dates'
import { useAppData } from '../../state/appDataContext'

// Короткие латинские коды статусов для адреса страницы (?status=new), чтобы адрес оставался читаемым
const CODE_BY_STATUS: Record<string, string> = {
  'новые': 'new',
  'на рассмотрении': 'pending',
  'согласована': 'approved',
  'отклонена': 'rejected',
  'согласована как исключение': 'exception',
  'заменена': 'replaced',
}
const STATUS_BY_CODE = Object.fromEntries(Object.entries(CODE_BY_STATUS).map(([s, c]) => [c, s]))

// Возврат из карточки на то же место списка: перед открытием заявки запоминаем прокрутку и номер
const RETURN_KEY = 'requests-list-return'
interface ReturnPoint { scrollY: number; id: number }
const saveReturnPoint = (p: ReturnPoint) => { try { sessionStorage.setItem(RETURN_KEY, JSON.stringify(p)) } catch { /* не запомним — не страшно */ } }
const readReturnPoint = (): ReturnPoint | null => { try { return JSON.parse(sessionStorage.getItem(RETURN_KEY) ?? 'null') } catch { return null } }

export default function RequestsList() {
  const { requests, units, employeeById, unitById, colorByRequest, resultsByRequest, rules } = useAppData()
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const [highlightId, setHighlightId] = useState<number | null>(null)

  // Вернулись из карточки («← Все заявки» или «Назад» в браузере) — прокручиваем к прежнему месту
  // и ненадолго подсвечиваем открытую заявку. Переход по вкладке «Заявки» открывает список сверху.
  const returning = navigationType === 'POP' || (location.state as { returning?: boolean } | null)?.returning === true
  useEffect(() => {
    const point = returning ? readReturnPoint() : null
    if (!point) return
    requestAnimationFrame(() => window.scrollTo(0, point.scrollY))
    setHighlightId(point.id)
    const t = setTimeout(() => setHighlightId(null), 2000)
    return () => clearTimeout(t)
  }, [returning])
  // Фильтры хранятся в адресе страницы: после открытия заявки и возврата они не сбрасываются
  const [params, setParams] = useSearchParams()
  const status = STATUS_BY_CODE[params.get('status') ?? ''] ?? 'все'
  const unitId = params.get('unit') ?? ''
  const search = params.get('q') ?? ''
  const setFilter = (key: string, value: string, empty: string) =>
    setParams((p) => {
      const next = new URLSearchParams(p)
      if (value === empty) next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  const setStatus = (v: string) => setFilter('status', CODE_BY_STATUS[v] ?? '', '')
  const setUnitId = (v: string) => setFilter('unit', v, '')
  const setSearch = (v: string) => setFilter('q', v, '')

  const severity = useMemo(() => new Map(rules.map((r) => [r.id, r.severity])), [rules])

  const rows = useMemo(() => {
    const unitIds = unitId ? descendants(units, +unitId) : null
    const query = search.trim().toLowerCase()
    return requests
      .filter((r) => !query || employeeById.get(r.employee_id)!.full_name.toLowerCase().includes(query))
      .filter((r) => status === 'все' || (status === 'новые' ? !r.viewed_at && r.status !== 'заменена' : r.status === status))
      .filter((r) => !unitIds || unitIds.has(employeeById.get(r.employee_id)!.unit_id))
      .sort((a, b) => b.id - a.id) // новые заявки сверху; номер растёт с каждой поданной заявкой
  }, [requests, units, employeeById, status, unitId, search])

  const isNew = (r: VacationRequest) => !r.viewed_at && r.status !== 'заменена'

  const summary = (id: number) => {
    const res = resultsByRequest.get(id) ?? []
    const violations = res.filter((r) => !r.passed && severity.get(r.rule_id) === 'нарушение').length
    const warnings = res.filter((r) => !r.passed && severity.get(r.rule_id) === 'предупреждение').length
    const conflicts = res.filter((r) => r.possible_conflict).length
    return [
      violations && `нарушений: ${violations}`,
      warnings && `предупреждений: ${warnings}`,
      conflicts && `возможных конфликтов: ${conflicts}`,
    ].filter(Boolean).join(', ') || 'всё выполнено'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold">Заявки</h1>
        <label className="w-64 text-sm">
          <span className="mb-1 block text-slate-500">Сотрудник</span>
          <input type="search" className={inputCls} placeholder="Найти по ФИО" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Статус</span>
          <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="все">Все</option>
            <option value="новые">новые (не открытые)</option>
            {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-slate-500">Подразделение</span>
          <select className={inputCls} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">Все</option>
            {flattenUnits(units).map(({ unit, depth }) => (
              <option key={unit.id} value={unit.id}>{indent(depth) + unit.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">№</th>
              <th className="px-4 py-3">Сотрудник</th>
              <th className="px-4 py-3">Подразделение</th>
              <th className="px-4 py-3">Тип</th>
              <th className="px-4 py-3">Даты</th>
              <th className="px-4 py-3">Подано</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Проверка</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => {
              const e = employeeById.get(r.employee_id)!
              const color = colorByRequest.get(r.id)!
              return (
                <tr key={r.id} onClick={() => { saveReturnPoint({ scrollY: window.scrollY, id: r.id }); navigate(`/hr/requests/${r.id}`, { state: { listSearch: location.search } }) }}
                  className={`cursor-pointer transition-colors duration-700 hover:bg-slate-50 ${highlightId === r.id ? 'bg-amber-100' : isNew(r) ? 'bg-sky-50/50' : ''}`}>
                  <td className="px-4 py-3 text-slate-500">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${isNew(r) ? 'bg-sky-500' : ''}`} title={isNew(r) ? 'Новая, ещё не открыта' : undefined} />
                      {r.id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className={isNew(r) ? 'font-bold' : 'font-medium'}>{e.full_name}</div>
                    <div className="text-xs text-slate-500">{e.role}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{unitById.get(e.unit_id)?.name}</td>
                  <td className="px-4 py-3 text-slate-600">{r.type}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {formatPeriod(r)}
                    <div className="text-xs text-slate-500">{lengthDays(r.start_date, r.end_date)} дн.</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(localDate(r.submitted_at))}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2"><ColorDot color={color} /><span className="text-xs text-slate-600">{summary(r.id)}</span></div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-500">Заявок нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
