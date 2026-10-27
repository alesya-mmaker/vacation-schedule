// Контекст общих данных — в отдельном файле без компонентов, чтобы при горячей перезагрузке
// кода в разработке он не пересоздавался (иначе экраны теряют связь с провайдером).
import { createContext, useContext } from 'react'
import type { Employee, MessageTemplate, OutboxMessage, RequestTypeRow, Rule, Unit, VacationRequest } from '../domain/types'
import type { CheckResult, Color } from '../rules/engine'

export interface Data {
  units: Unit[]
  employees: Employee[]
  requests: VacationRequest[]
  rules: Rule[]
  templates: MessageTemplate[]
  outbox: OutboxMessage[]
  requestTypes: RequestTypeRow[]
}

export interface AppData extends Data {
  resultsByRequest: Map<number, CheckResult[]>
  colorByRequest: Map<number, Color>
  employeeById: Map<number, Employee>
  unitById: Map<number, Unit>
  reload: () => Promise<void>
}

export const AppDataContext = createContext<AppData | null>(null)

export function useAppData() {
  const v = useContext(AppDataContext)
  if (!v) throw new Error('useAppData вне AppDataProvider')
  return v
}
