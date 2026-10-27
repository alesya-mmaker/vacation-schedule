import { useState } from 'react'
import { btn, inputCls } from '../../components/ui'
import { useEscape } from '../../components/useEscape'
import * as api from '../../data/api'
import { mmddToText, PEERS_LABEL, RULE_KINDS, ruleName, type Params } from '../../domain/ruleKinds'
import { ROLES, SEVERITIES, type Rule, type Severity } from '../../domain/types'
import { useAppData } from '../../state/appDataContext'

// Окно правила: изменить существующее или добавить новое на основе одного из видов проверок

function NumberField({ label, value, onChange, suffix = 'дн.' }: { label: string; value: unknown; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={0} className={`${inputCls} w-28`} value={Number(value)} onChange={(e) => onChange(Math.max(0, Math.round(+e.target.value)))} />
        <span className="text-slate-500">{suffix}</span>
      </span>
    </label>
  )
}

function RoleField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <select className={inputCls} value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {ROLES.map((r) => <option key={r}>{r}</option>)}
      </select>
    </label>
  )
}

// Дата без года: в базе «MM-DD», на экране «дд.мм»
function DayMonthField({ label, value, onChange }: { label: string; value: unknown; onChange: (v: string | null) => void }) {
  const [text, setText] = useState(mmddToText(value))
  const parse = (t: string) => {
    const m = /^(\d{1,2})\.(\d{1,2})$/.exec(t.trim())
    if (!m || +m[1] < 1 || +m[1] > 31 || +m[2] < 1 || +m[2] > 12) return null
    return `${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  }
  const invalid = parse(text) == null
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600">{label}</span>
      <input
        className={`${inputCls} w-28 ${invalid ? 'border-red-400' : ''}`}
        placeholder="дд.мм"
        value={text}
        onChange={(e) => { setText(e.target.value); onChange(parse(e.target.value)) }}
      />
    </label>
  )
}

function ParamsEditor({ type, params, set }: { type: string; params: Params; set: (key: string, v: unknown) => void }) {
  switch (type) {
    case 'group_limit':
      return (
        <div className="flex flex-wrap gap-4">
          <RoleField label="Должность" value={params.role} onChange={(v) => set('role', v)} />
          <NumberField label="Не более одновременно" value={params.max} onChange={(v) => set('max', v)} suffix="чел." />
        </div>
      )
    case 'role_conflict': {
      const subs = (params.subordinates as string[] | undefined) ?? []
      return (
        <div className="space-y-3">
          <RoleField label="Должность сотрудника" value={params.role} onChange={(v) => set('role', v)} />
          <div className="text-sm">
            <span className="mb-1 block text-slate-600">Нельзя одновременно с:</span>
            <label className="flex items-center gap-2">
              коллегами той же должности
              <select className={`${inputCls} w-auto`} value={String(params.peers ?? '')} onChange={(e) => set('peers', e.target.value || null)}>
                <option value="">— не проверять</option>
                {Object.entries(PEERS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={Boolean(params.manager)} onChange={(e) => set('manager', e.target.checked)} /> своим руководителем
            </label>
            <div className="mt-2">подчинёнными должностей:</div>
            <div className="mt-1 flex flex-wrap gap-3">
              {ROLES.map((r) => (
                <label key={r} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={subs.includes(r)}
                    onChange={(e) => set('subordinates', e.target.checked ? [...subs, r] : subs.filter((x) => x !== r))}
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>
        </div>
      )
    }
    case 'advance_notice':
      return <NumberField label="Не позднее чем за" value={params.min_days} onChange={(v) => set('min_days', v)} />
    case 'reschedule_notice':
      return <NumberField label="Перенос не позднее чем за" value={params.min_days} onChange={(v) => set('min_days', v)} />
    case 'season_max_length':
      return (
        <div className="flex flex-wrap gap-4">
          <DayMonthField label="Период с" value={params.from} onChange={(v) => set('from', v)} />
          <DayMonthField label="по" value={params.to} onChange={(v) => set('to', v)} />
          <NumberField label="Не длиннее" value={params.max_days} onChange={(v) => set('max_days', v)} />
        </div>
      )
    case 'schedule_deadline':
      return (
        <div className="flex flex-wrap gap-4">
          <DayMonthField label="График на 1-е полугодие до" value={params.h1_deadline} onChange={(v) => set('h1_deadline', v)} />
          <DayMonthField label="на 2-е полугодие до" value={params.h2_deadline} onChange={(v) => set('h2_deadline', v)} />
        </div>
      )
    case 'law_min_part':
      return <NumberField label="Хотя бы одна часть не менее" value={params.min_days} onChange={(v) => set('min_days', v)} />
    case 'law_annual_total':
      return <NumberField label="Норма в году" value={params.norm_days} onChange={(v) => set('norm_days', v)} />
    default:
      return <p className="text-sm text-slate-500">Параметров нет.</p>
  }
}

export default function RuleDialog({ rule, onClose, onSaving, onFailed }: { rule?: Rule; onClose: () => void; onSaving: () => void; onFailed: () => void }) {
  const { rules, requestTypes, reload } = useAppData()
  useEscape(onClose)
  const [type, setType] = useState(rule?.type ?? 'group_limit')
  const kind = RULE_KINDS[type]
  const activeTypes = requestTypes.filter((t) => t.active).map((t) => t.name)
  const [params, setParams] = useState<Params>(rule?.params ?? kind.defaultParams)
  const [severity, setSeverity] = useState<Severity>(rule?.severity ?? kind.defaultSeverity)
  const [appliesTo, setAppliesTo] = useState<string[]>(rule?.applies_to ?? (kind.vacationOnly ? ['отпуск'] : activeTypes))
  const [source, setSource] = useState(rule?.source ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeOptions = [...new Set([...requestTypes.map((t) => t.name), ...appliesTo])]
  const paramsValid = Object.values(params).every((v) => v !== null || type === 'role_conflict')
  const conflictEmpty = type === 'role_conflict' && !params.peers && !params.manager && ((params.subordinates as string[] | undefined) ?? []).length === 0
  const valid = paramsValid && !conflictEmpty && appliesTo.length > 0 && source.trim() !== ''

  function chooseType(t: string) {
    const k = RULE_KINDS[t]
    setType(t)
    setParams(k.defaultParams)
    setSeverity(k.defaultSeverity)
    setAppliesTo(k.vacationOnly ? ['отпуск'] : activeTypes)
  }

  async function save() {
    setBusy(true)
    setError(null)
    const fields = { name: ruleName(type, params), type, params, severity, applies_to: appliesTo, source: source.trim() }
    try {
      onSaving()
      if (rule) await api.updateRule(rule.id, fields)
      else await api.createRule({ ...fields, enabled: true, sort_order: Math.max(0, ...rules.map((r) => r.sort_order)) + 10 })
      await reload()
      onClose()
    } catch (e) {
      onFailed()
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{rule ? 'Изменить правило' : 'Новое правило'}</h2>

        {rule ? (
          <p className="text-sm text-slate-600"><span className="font-medium">{kind.title}.</span> {kind.description}</p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Вид проверки</span>
            <select className={inputCls} value={type} onChange={(e) => chooseType(e.target.value)}>
              {Object.entries(RULE_KINDS).map(([t, k]) => <option key={t} value={t}>{k.title}</option>)}
            </select>
            <span className="mt-1 block text-xs text-slate-500">{kind.description}</span>
          </label>
        )}

        <div className="rounded-lg border border-slate-200 p-4">
          <ParamsEditor key={type} type={type} params={params} set={(k, v) => setParams((p) => ({ ...p, [k]: v }))} />
        </div>

        <p className="text-sm">
          <span className="text-slate-500">Название в чек-листе: </span>
          <span className="font-medium">{ruleName(type, params)}</span>
        </p>

        <div className="flex flex-wrap gap-6">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Уровень</span>
            <select className={`${inputCls} w-auto`} value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
              {SEVERITIES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
          <div className="text-sm">
            <span className="mb-1 block text-slate-600">Применять к типам заявлений</span>
            <div className="flex flex-wrap gap-3 pt-2">
              {typeOptions.map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={appliesTo.includes(t)}
                    onChange={(e) => setAppliesTo(e.target.checked ? [...appliesTo, t] : appliesTo.filter((x) => x !== t))}
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Источник</span>
          <input className={inputCls} placeholder="например: Регламент, п.6 или ТК РБ, ст.174" value={source} onChange={(e) => setSource(e.target.value)} />
        </label>

        {!paramsValid && <p className="text-sm text-red-700">Проверьте даты в формате дд.мм.</p>}
        {conflictEmpty && <p className="text-sm text-red-700">Выберите, с кем нельзя одновременно: коллеги, руководитель или подчинённые.</p>}
        {appliesTo.length === 0 && <p className="text-sm text-red-700">Выберите хотя бы один тип заявлений.</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className={btn.ghost} onClick={onClose}>Отмена</button>
          <button className={btn.primary} disabled={!valid || busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить и пересчитать'}</button>
        </div>
      </div>
    </div>
  )
}
