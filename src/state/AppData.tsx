// Общие данные приложения: загружаются через слой данных, правила пересчитываются в памяти
// при каждом изменении заявок или правил, и результаты сохраняются в базу.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import * as api from '../data/api'
import { buildContext, evaluateAll, requestColor, type CheckResult } from '../rules/engine'
import { AppDataContext, type AppData, type Data } from './appDataContext'

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [units, employees, requests, rules, templates, outbox, requestTypes] = await Promise.all([
        api.listUnits(), api.listEmployees(), api.listRequests(), api.listRules(), api.listTemplates(), api.listOutbox(),
        api.listRequestTypes(),
      ])
      setData({ units, employees, requests, rules, templates, outbox, requestTypes })
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Свежие данные без обновления страницы: сразу при изменении заявок в базе
  // и при возврате на вкладку (на случай, если оповещение не дошло, например после сна компьютера).
  // Несколько изменений подряд (замена заявки при корректировке) собираются в одну загрузку.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void reload(), 300)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    const unsubscribe = api.onRequestsChange(refresh)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [reload])

  const results = useMemo(
    () => (data ? evaluateAll(data.rules, buildContext(data.employees, data.units, data.requests)) : []),
    [data],
  )

  // Сохраняем пересчитанные результаты в базу (таблица rule_results).
  // Сохранения выстраиваются в очередь, чтобы два пересчёта подряд не мешали друг другу.
  // Приложение берёт результаты из памяти, поэтому сбой сохранения не мешает работать — только предупреждаем.
  const saveQueue = useRef(Promise.resolve())
  const [saveError, setSaveError] = useState<string | null>(null)
  useEffect(() => {
    if (!data) return
    saveQueue.current = saveQueue.current
      .then(() => api.replaceRuleResults(results.map(({ request_id, rule_id, passed, possible_conflict, message }) => ({ request_id, rule_id, passed, possible_conflict, message }))))
      .then(() => setSaveError(null))
      .catch((e: Error) => setSaveError(e.message))
  }, [data, results])

  const value = useMemo<AppData | null>(() => {
    if (!data) return null
    const resultsByRequest = new Map<number, CheckResult[]>()
    for (const r of results) resultsByRequest.set(r.request_id, [...(resultsByRequest.get(r.request_id) ?? []), r])
    const colorByRequest = new Map(data.requests.map((r) => [r.id, requestColor(resultsByRequest.get(r.id) ?? [], data.rules)]))
    return {
      ...data,
      resultsByRequest,
      colorByRequest,
      employeeById: new Map(data.employees.map((e) => [e.id, e])),
      unitById: new Map(data.units.map((u) => [u.id, u])),
      reload,
    }
  }, [data, results, reload])

  if (error) return <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
  if (!value) return <div className="p-6 text-slate-500">Загрузка…</div>
  return (
    <AppDataContext.Provider value={value}>
      {saveError && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Результаты проверки не сохранились в базу (на экране они актуальны): {saveError}
        </div>
      )}
      {children}
    </AppDataContext.Provider>
  )
}
