import { useState } from 'react'
import * as api from '../../data/api'
import { btn, inputCls } from '../../components/ui'
import { RecalcBanner } from '../../components/RecalcBanner'
import { useEscape } from '../../components/useEscape'
import { ROLES, type Employee, type Role } from '../../domain/types'
import { flattenUnits, indent } from '../../domain/units'
import { useAppData } from '../../state/appDataContext'
import { useRecalcTracker } from '../../state/useRecalcTracker'

// Справочник сотрудников. Удалённый сотрудник удаляется вместе с заявками и сообщениями;
// в рабочей версии список должен приходить из 1С (см. README, «Развитие»).

type Draft = Omit<api.EmployeeInput, 'unit_id' | 'manager_id'> & { unit_id: string; manager_id: string }

const toDraft = (e?: Employee): Draft => ({
  full_name: e?.full_name ?? '',
  personnel_number: e?.personnel_number ?? '',
  role: e?.role ?? 'МПП',
  unit_id: e ? String(e.unit_id) : '',
  manager_id: e?.manager_id != null ? String(e.manager_id) : '',
  active: e?.active ?? true,
})

function EmployeeDialog({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { units, employees, reload } = useAppData()
  useEscape(onClose)
  const [d, setD] = useState<Draft>(toDraft(employee))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const valid = d.full_name.trim() !== '' && d.personnel_number.trim() !== '' && d.unit_id !== ''

  async function save() {
    setBusy(true)
    setError(null)
    const input: api.EmployeeInput = {
      ...d,
      full_name: d.full_name.trim(),
      personnel_number: d.personnel_number.trim(),
      unit_id: +d.unit_id,
      manager_id: d.manager_id ? +d.manager_id : null,
    }
    try {
      if (employee) await api.updateEmployee(employee.id, input)
      else await api.createEmployee(input)
      await reload()
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg.includes('personnel_number') ? 'Такой табельный номер уже есть.' : msg)
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{employee ? 'Изменить сотрудника' : 'Новый сотрудник'}</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">ФИО</span>
          <input autoFocus className={inputCls} value={d.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Табельный номер</span>
            <input className={inputCls} value={d.personnel_number} onChange={(e) => set('personnel_number', e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">Должность</span>
            <select className={inputCls} value={d.role} onChange={(e) => set('role', e.target.value as Role)}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Подразделение</span>
          <select className={inputCls} value={d.unit_id} onChange={(e) => set('unit_id', e.target.value)}>
            <option value="">Выберите</option>
            {flattenUnits(units).map(({ unit, depth }) => <option key={unit.id} value={unit.id}>{indent(depth) + unit.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600">Непосредственный руководитель</span>
          <select className={inputCls} value={d.manager_id} onChange={(e) => set('manager_id', e.target.value)}>
            <option value="">—</option>
            {employees.filter((e) => e.active && e.id !== employee?.id).map((e) => (
              <option key={e.id} value={e.id}>{e.full_name} ({e.role})</option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">От руководителя зависят правила п.1 регламента (кто с кем не может быть в отпуске одновременно).</span>
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button className={btn.ghost} onClick={onClose}>Отмена</button>
          <button className={btn.primary} disabled={!valid || busy} onClick={save}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  )
}

// Иконка корзины: почти незаметна, проявляется при наведении на строку
function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
      <path d="M3.5 5.5h13M8 5.5V4h4v1.5M5.5 5.5l.8 10.5h7.4l.8-10.5M8.5 8.5v5M11.5 8.5v5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Employees() {
  const { employees, employeeById, unitById, requests, outbox, reload } = useAppData()
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const recalc = useRecalcTracker()

  // Удаление: сотрудник, его заявки и сообщения ему. Перед этим честно показываем, кого это заденет.
  async function remove(e: Employee) {
    const own = requests.filter((r) => r.employee_id === e.id).length
    const messages = outbox.filter((m) => m.employee_id === e.id).length
    const subordinates = employees.filter((x) => x.manager_id === e.id).length
    const asSubstitute = requests.filter((r) => r.substitute_id === e.id && r.employee_id !== e.id && r.status !== 'заменена').length
    const lines = [
      `Удалить сотрудника ${e.full_name}?`,
      '',
      `Будут удалены: заявок — ${own}, сообщений — ${messages}.`,
      subordinates > 0 && `У ${subordinates} сотрудн. он указан руководителем — поле станет пустым.`,
      asSubstitute > 0 && `В ${asSubstitute} заявк. других сотрудников он заместитель — заместитель станет «не указан».`,
      '',
      'После удаления все заявки будут пересчитаны. Отменить удаление нельзя.',
    ].filter((l) => l !== false)
    if (!window.confirm(lines.join('\n'))) return
    setError(null)
    try {
      recalc.remember()
      await api.deleteEmployee(e.id)
      await reload()
    } catch (err) {
      recalc.forget()
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">Сотрудники</h1>
        <button className={btn.primary} onClick={() => setEditing('new')}>Добавить сотрудника</button>
      </div>

      <RecalcBanner changes={recalc.changes} onClose={recalc.dismiss} title="Сотрудник удалён, все заявки пересчитаны." />
      {error && <p className="text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">ФИО</th>
              <th className="px-4 py-3">Таб. №</th>
              <th className="px-4 py-3">Должность</th>
              <th className="px-4 py-3">Подразделение</th>
              <th className="px-4 py-3">Руководитель</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((e) => (
              <tr key={e.id} className="group">
                <td className="px-4 py-3 font-medium">{e.full_name}</td>
                <td className="px-4 py-3">{e.personnel_number}</td>
                <td className="px-4 py-3">{e.role}</td>
                <td className="px-4 py-3">{unitById.get(e.unit_id)?.name}</td>
                <td className="px-4 py-3">{e.manager_id != null ? employeeById.get(e.manager_id)?.full_name : '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <button className="mr-3 text-sky-700 underline" onClick={() => setEditing(e)}>Изменить</button>
                  <button
                    title="Удалить сотрудника"
                    aria-label={`Удалить ${e.full_name}`}
                    className="rounded p-1 align-middle text-slate-300 opacity-60 transition hover:bg-red-50 hover:text-red-600 hover:opacity-100 group-hover:opacity-100"
                    onClick={() => remove(e)}
                  >
                    <TrashIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EmployeeDialog employee={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
