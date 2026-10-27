import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLES, type Employee, type RequestStatus, type VacationRequest } from '../../domain/types'
import { descendants, flattenUnits } from '../../domain/units'
import { daysBetween, formatPeriod, lengthDays, localDate, type Period } from '../../rules/dates'
import { useAppData } from '../../state/appDataContext'
import { inputCls } from '../../components/ui'

// График отпусков на год: сотрудники по строкам (сгруппированы по подразделениям), месяцы по горизонтали,
// заявки — полосы цвета статуса. Нарушения: полоса с красной рамкой, дни пересечения с конфликтующими
// согласованными отпусками заштрихованы красным на обеих полосах.

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

const BAR_STYLE: Partial<Record<RequestStatus, string>> = {
  'на рассмотрении': 'bg-sky-400',
  'согласована': 'bg-emerald-500',
  'согласована как исключение': 'bg-violet-500',
  'отклонена': 'bg-slate-300',
}

const HATCH = 'repeating-linear-gradient(135deg, rgba(220,38,38,.9) 0 3px, rgba(255,255,255,.55) 3px 6px)'

const ROLE_ORDER = new Map(ROLES.map((r, i) => [r, i]))

function clip(p: Period, year: string): Period | null {
  const from = `${year}-01-01`
  const to = `${year}-12-31`
  if (p.end_date < from || p.start_date > to) return null
  return { start_date: p.start_date < from ? from : p.start_date, end_date: p.end_date > to ? to : p.end_date }
}

export default function Timeline() {
  const { requests, employees, units, unitById, resultsByRequest, rules, employeeById } = useAppData()
  const navigate = useNavigate()

  const years = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of requests) counts.set(r.start_date.slice(0, 4), (counts.get(r.start_date.slice(0, 4)) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([y]) => y)
  }, [requests])
  const [year, setYear] = useState(years[0] ?? localDate(new Date().toISOString()).slice(0, 4))
  const [showRejected, setShowRejected] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')

  const yearDays = lengthDays(`${year}-01-01`, `${year}-12-31`)
  const pct = (d: string) => (daysBetween(`${year}-01-01`, d) / yearDays) * 100
  const span = (p: Period) => ({ left: `${pct(p.start_date)}%`, width: `${(lengthDays(p.start_date, p.end_date) / yearDays) * 100}%` })
  const monthStarts = MONTHS.map((_, i) => `${year}-${String(i + 1).padStart(2, '0')}-01`)
  const today = localDate(new Date().toISOString())

  const visible = requests.filter(
    (r) => r.status !== 'заменена' && (showRejected || r.status !== 'отклонена') && clip(r, year),
  )

  // Нарушения и заштрихованные пересечения
  const severity = new Map(rules.map((r) => [r.id, r.severity]))
  const violating = new Set<number>()
  const hatches = new Map<number, Period[]>()
  for (const r of visible) {
    for (const res of resultsByRequest.get(r.id) ?? []) {
      if (res.passed || severity.get(res.rule_id) !== 'нарушение') continue
      violating.add(r.id)
      for (const c of res.conflicts) {
        const days = clip(c, year)
        if (!days) continue
        for (const id of [r.id, c.request_id]) hatches.set(id, [...(hatches.get(id) ?? []), days])
      }
    }
  }

  // Группы: подразделение сотрудника; менеджеры секций — в группе своего отдела
  const groupOf = (e: Employee) => {
    const u = unitById.get(e.unit_id)
    return u?.type === 'секция' && u.parent_id != null ? u.parent_id : e.unit_id
  }
  const withRequests = new Set(visible.map((r) => r.employee_id))
  // Поиск по ФИО: остаются только найденные сотрудники, свёрнутые подразделения раскрываются
  const query = search.trim().toLowerCase()
  const people = employees.filter((e) => (e.active || withRequests.has(e.id)) && (!query || e.full_name.toLowerCase().includes(query)))
  const groups = flattenUnits(units)
    .filter(({ unit }) => unit.type !== 'секция')
    .map(({ unit, depth }) => ({
      unit,
      depth,
      people: people
        .filter((e) => groupOf(e) === unit.id)
        .sort((a, b) => ROLE_ORDER.get(a.role)! - ROLE_ORDER.get(b.role)! || a.full_name.localeCompare(b.full_name, 'ru')),
    }))
    .map((g) => {
      // все сотрудники подразделения вместе с вложенными — для свёрнутого вида.
      // Корень (вся компания) сворачивает только своих сотрудников, не всё дерево.
      const inside = g.unit.parent_id == null ? new Set([g.unit.id]) : descendants(units, g.unit.id)
      return { ...g, everyone: people.filter((e) => inside.has(groupOf(e))) }
    })
    .filter((g) => g.everyone.length > 0)

  const barsOf = (e: Employee) => visible.filter((r) => r.employee_id === e.id)

  // Свёрнутое подразделение скрывает своих сотрудников и все вложенные подразделения
  const hiddenByParent = (unitId: number) => {
    if (query) return false
    for (let u = unitById.get(unitId); u?.parent_id != null; u = unitById.get(u.parent_id)) {
      const parent = unitById.get(u.parent_id)
      if (parent?.parent_id != null && collapsed.has(parent.id)) return true
    }
    return false
  }
  const toggle = (id: number) =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const grid = (
    <>
      {monthStarts.slice(1).map((m) => (
        <div key={m} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${pct(m)}%` }} />
      ))}
      {today.startsWith(year) && <div className="absolute inset-y-0 z-[1] border-l-2 border-amber-400" style={{ left: `${pct(today)}%` }} />}
    </>
  )

  const title = (r: VacationRequest) =>
    `${employeeById.get(r.employee_id)?.full_name}\n${r.type}, ${formatPeriod(r)} (${lengthDays(r.start_date, r.end_date)} дн.)\n${r.status}` +
    (violating.has(r.id) ? '\nЕсть нарушения — откройте заявку' : '')

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">График</h1>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          Год
          <select className={`${inputCls} w-auto`} value={year} onChange={(e) => setYear(e.target.value)}>
            {[...years].sort().map((y) => <option key={y}>{y}</option>)}
          </select>
        </label>
        <div className="ml-auto w-64">
          <input
            type="search"
            className={inputCls}
            placeholder="Найти сотрудника"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-3 text-sm">
          <button className="text-sky-700 underline" onClick={() => setCollapsed(new Set(groups.map((g) => g.unit.id)))}>Свернуть все</button>
          <button className="text-sky-700 underline" onClick={() => setCollapsed(new Set())}>Развернуть все</button>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showRejected} onChange={(e) => setShowRejected(e.target.checked)} /> Показывать отклонённые
        </label>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {Object.entries(BAR_STYLE)
          .filter(([s]) => showRejected || s !== 'отклонена')
          .map(([s, cls]) => <span key={s} className="flex items-center gap-1.5"><span className={`h-2.5 w-5 rounded-sm ${cls}`} />{s}</span>)}
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm bg-sky-400 ring-2 ring-red-500" />есть нарушение</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ background: HATCH }} />дни пересечения, из-за которых нарушение</span>
        {today.startsWith(year) && <span className="flex items-center gap-1.5"><span className="h-3 border-l-2 border-amber-400" />сегодня</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="min-w-[1100px]">
          <div className="flex border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
            <div className="sticky left-0 z-10 w-64 shrink-0 border-r border-slate-200 bg-slate-50 px-4 py-2">Сотрудник</div>
            <div className="relative flex-1">
              {monthStarts.map((m, i) => (
                <div key={m} className="absolute inset-y-0 py-2 pl-1.5" style={{ left: `${pct(m)}%` }}>{MONTHS[i]}</div>
              ))}
            </div>
          </div>

          {query && groups.every((g) => g.people.length === 0) && (
            <div className="px-4 py-8 text-center text-sm text-slate-500">Никого не найдено</div>
          )}
          {groups.filter((g) => !hiddenByParent(g.unit.id) && (!query || g.people.length > 0)).map((g) => {
            const isCollapsed = !query && collapsed.has(g.unit.id)
            const groupBars = g.everyone.flatMap(barsOf)
            return (
            <div key={g.unit.id}>
              <div className="flex border-b border-slate-100 bg-slate-50/60">
                <button
                  onClick={() => toggle(g.unit.id)}
                  className="sticky left-0 z-10 flex w-64 shrink-0 items-center gap-1.5 border-r border-slate-200 bg-slate-50 px-4 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  style={{ paddingLeft: 12 + g.depth * 12 }}
                >
                  <span className="w-3 text-slate-400">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="truncate">{g.unit.name}</span>
                  {isCollapsed && <span className="font-normal text-slate-400">({g.everyone.length})</span>}
                  {isCollapsed && groupBars.some((r) => violating.has(r.id)) && <span title="Есть нарушения" className="h-2 w-2 shrink-0 rounded-full bg-red-500" />}
                </button>
                <div className="relative flex-1">
                  {grid}
                  {/* В свёрнутом виде — все отпуска подразделения тонкими полосами */}
                  {isCollapsed && groupBars.map((r) => (
                    <div
                      key={r.id}
                      title={title(r)}
                      className={`absolute top-1/2 z-[2] h-1.5 -translate-y-1/2 rounded-sm opacity-80 ${violating.has(r.id) ? 'bg-red-500' : BAR_STYLE[r.status]}`}
                      style={span(clip(r, year)!)}
                    />
                  ))}
                </div>
              </div>
              {!isCollapsed && g.people.map((e) => (
                <div key={e.id} className="flex border-b border-slate-100 hover:bg-slate-50/50">
                  <div className="sticky left-0 z-10 w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-1.5" style={{ paddingLeft: 16 + g.depth * 12 }}>
                    <div className={`truncate text-sm ${e.active ? '' : 'text-slate-400'}`}>{e.full_name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {e.role}{unitById.get(e.unit_id)?.type === 'секция' && `, ${unitById.get(e.unit_id)?.name}`}{!e.active && ' (уволен)'}
                    </div>
                  </div>
                  <div className="relative flex-1">
                    {grid}
                    {barsOf(e).map((r) => (
                      <button
                        key={r.id}
                        title={title(r)}
                        onClick={() => navigate(`/hr/requests/${r.id}`)}
                        className={`absolute top-1/2 z-[2] h-5 -translate-y-1/2 overflow-hidden rounded ${BAR_STYLE[r.status]} ${violating.has(r.id) ? 'ring-2 ring-red-500' : ''} hover:brightness-110`}
                        style={span(clip(r, year)!)}
                      >
                        {(hatches.get(r.id) ?? []).map((h, i) => {
                          const bar = clip(r, year)!
                          const barDays = lengthDays(bar.start_date, bar.end_date)
                          return (
                            <span
                              key={i}
                              className="pointer-events-none absolute inset-y-0"
                              style={{
                                left: `${(daysBetween(bar.start_date, h.start_date) / barDays) * 100}%`,
                                width: `${(lengthDays(h.start_date, h.end_date) / barDays) * 100}%`,
                                background: HATCH,
                              }}
                            />
                          )
                        })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
