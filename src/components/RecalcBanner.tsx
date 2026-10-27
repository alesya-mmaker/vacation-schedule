import { Link } from 'react-router-dom'
import type { Color } from '../rules/engine'
import type { Change } from '../state/useRecalcTracker'
import { COLOR_DOT } from './ui'

// Сообщение «все заявки пересчитаны» со списком заявок, у которых изменился цвет

const COLOR_WORD: Record<Color, string> = { green: 'зелёная', yellow: 'жёлтая', red: 'красная' }

export function RecalcBanner({ changes, onClose, title = 'Все заявки пересчитаны.' }: { changes: Change[] | null; onClose: () => void; title?: string }) {
  if (!changes) return null
  return (
    <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        {changes.length === 0 ? (
          <div>Цвет ни одной заявки не изменился.</div>
        ) : (
          <ul className="mt-1 space-y-1">
            {changes.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-1.5">
                <Link to={`/hr/requests/${c.id}`} className="underline">№{c.id} {c.name}</Link>:
                <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[c.from]}`} />{COLOR_WORD[c.from]} →
                <span className={`h-2.5 w-2.5 rounded-full ${COLOR_DOT[c.to]}`} />{COLOR_WORD[c.to]}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button className="text-emerald-700" onClick={onClose}>✕</button>
    </div>
  )
}
