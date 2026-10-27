/* eslint-disable react-refresh/only-export-components */
import type { RequestStatus } from '../domain/types'
import type { Color } from '../rules/engine'

export const COLOR_DOT: Record<Color, string> = {
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  red: 'bg-red-500',
}

export const COLOR_LABEL: Record<Color, string> = {
  green: 'Все правила выполнены',
  yellow: 'Есть предупреждения или возможные конфликты',
  red: 'Есть нарушения',
}

export function ColorDot({ color }: { color: Color }) {
  return <span title={COLOR_LABEL[color]} className={`inline-block h-3 w-3 shrink-0 rounded-full ${COLOR_DOT[color]}`} />
}

const STATUS_STYLE: Record<RequestStatus, string> = {
  'на рассмотрении': 'bg-sky-100 text-sky-800',
  'согласована': 'bg-emerald-100 text-emerald-800',
  'согласована как исключение': 'bg-violet-100 text-violet-800',
  'отклонена': 'bg-red-100 text-red-800',
  'заменена': 'bg-slate-200 text-slate-600',
}

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>{status}</span>
}

export function Card({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
      {children}
    </section>
  )
}

export const btn = {
  primary: 'rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40',
  green: 'rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40',
  red: 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40',
  violet: 'rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40',
  ghost: 'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50',
}

export const inputCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none'
