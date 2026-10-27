import { useState } from 'react'
import { RecalcBanner } from '../../components/RecalcBanner'
import { btn, Card, inputCls } from '../../components/ui'
import * as api from '../../data/api'
import { RULE_KINDS } from '../../domain/ruleKinds'
import type { Rule, Severity } from '../../domain/types'
import { useAppData } from '../../state/appDataContext'
import { useRecalcTracker } from '../../state/useRecalcTracker'
import RuleDialog from './RuleDialog'

const SEVERITY_STYLE: Record<Severity, string> = {
  'нарушение': 'bg-red-100 text-red-800',
  'предупреждение': 'bg-amber-100 text-amber-800',
  'информация': 'bg-sky-100 text-sky-800',
}

function RequestTypes({ onSaving, onFailed }: { onSaving: () => void; onFailed: () => void }) {
  const { requestTypes, reload } = useAppData()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      onSaving()
      await action()
      await reload()
    } catch (e) {
      onFailed()
      setError((e as Error).message)
    }
  }

  const add = () => {
    const n = name.trim().toLowerCase()
    if (!n) return
    if (requestTypes.some((t) => t.name === n)) return setError('Такой тип уже есть.')
    void run(async () => {
      await api.createRequestType({ name: n, active: true, sort_order: Math.max(0, ...requestTypes.map((t) => t.sort_order)) + 10 })
      setName('')
    })
  }

  return (
    <Card title="Типы заявлений">
      <p className="mb-3 text-sm text-slate-500">Показываются в форме сотрудника. Скрытый тип пропадает из формы, а старые заявки этого типа остаются.</p>
      <div className="flex flex-wrap gap-2">
        {requestTypes.map((t) => (
          <span key={t.name} className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${t.active ? 'border-slate-300' : 'border-dashed border-slate-300 text-slate-400'}`}>
            {t.name}
            <button
              className="text-xs text-sky-700 underline"
              onClick={() => run(() => api.updateRequestType(t.name, { active: !t.active }))}
            >
              {t.active ? 'скрыть' : 'вернуть'}
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex max-w-md gap-2">
        <input className={inputCls} placeholder="Новый тип, например: учебный отпуск" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className={btn.ghost} onClick={add} disabled={!name.trim()}>Добавить</button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </Card>
  )
}

export default function Rules() {
  const { rules, reload } = useAppData()
  const [editing, setEditing] = useState<Rule | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recalc = useRecalcTracker()

  async function run(action: () => Promise<void>) {
    setError(null)
    try {
      recalc.remember()
      await action()
      await reload()
    } catch (e) {
      recalc.forget()
      setError((e as Error).message)
    }
  }

  const sorted = [...rules].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Правила</h1>
        <button className={btn.primary} onClick={() => setEditing('new')}>Добавить правило</button>
      </div>

      <RecalcBanner changes={recalc.changes} onClose={recalc.dismiss} />
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Вкл.</th>
              <th className="px-4 py-3">Правило</th>
              <th className="px-4 py-3">Уровень</th>
              <th className="px-4 py-3">Типы заявлений</th>
              <th className="px-4 py-3">Источник</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((r) => (
              <tr key={r.id} className={r.enabled ? '' : 'text-slate-400'}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    title={r.enabled ? 'Выключить правило' : 'Включить правило'}
                    checked={r.enabled}
                    onChange={() => run(() => api.updateRule(r.id, { enabled: !r.enabled }))}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs text-slate-500">{RULE_KINDS[r.type]?.title ?? r.type}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${r.enabled ? SEVERITY_STYLE[r.severity] : 'bg-slate-100'}`}>{r.severity}</span>
                </td>
                <td className="px-4 py-3 text-xs">{r.applies_to.join(', ')}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{r.source}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button className="mr-3 text-sky-700 underline" onClick={() => setEditing(r)}>Изменить</button>
                  <button
                    className="text-red-700 underline"
                    onClick={() => window.confirm(`Удалить правило «${r.name}»? Его можно просто выключить.`) && run(() => api.deleteRule(r.id))}
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RequestTypes onSaving={recalc.remember} onFailed={recalc.forget} />

      {editing && <RuleDialog rule={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaving={recalc.remember} onFailed={recalc.forget} />}
    </div>
  )
}
