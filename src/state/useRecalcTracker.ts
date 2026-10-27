// Что изменилось после пересчёта: до изменения запоминаем цвета заявок; когда данные перезагрузятся
// (появится новая карта цветов), отдаём список заявок, у которых цвет стал другим.
import { useEffect, useRef, useState } from 'react'
import type { Color } from '../rules/engine'
import { useAppData } from './appDataContext'

export interface Change { id: number; name: string; from: Color; to: Color }

export function useRecalcTracker() {
  const { colorByRequest, requests, employeeById } = useAppData()
  const before = useRef<Map<number, Color> | null>(null)
  const [changes, setChanges] = useState<Change[] | null>(null)

  useEffect(() => {
    const prev = before.current
    if (!prev || prev === colorByRequest) return
    before.current = null
    setChanges(
      requests
        .filter((r) => r.status !== 'заменена' && prev.has(r.id) && prev.get(r.id) !== colorByRequest.get(r.id))
        .map((r) => ({ id: r.id, name: employeeById.get(r.employee_id)?.full_name ?? '', from: prev.get(r.id)!, to: colorByRequest.get(r.id)! })),
    )
  }, [colorByRequest, requests, employeeById])

  return {
    changes,
    remember: () => { before.current = colorByRequest; setChanges(null) },
    forget: () => { before.current = null },
    dismiss: () => setChanges(null),
  }
}
