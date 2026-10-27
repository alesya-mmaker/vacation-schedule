import { useId, useMemo, useRef, useState } from 'react'
import { inputCls } from './ui'

export interface Option {
  value: number
  label: string
  hint?: string
}

// Выпадающий список с поиском по мере ввода
export default function SearchSelect({
  options, value, onChange, placeholder, emptyText = 'Ничего не найдено', disabled,
}: {
  options: Option[]
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  emptyText?: string
  disabled?: boolean
}) {
  const listId = useId()
  const selected = options.find((o) => o.value === value)
  const [query, setQuery] = useState<string | null>(null) // null — показываем выбранное, а не ввод
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const blurTimer = useRef<number | undefined>(undefined)

  // Сначала совпадения с начала (фамилия), затем с начала любого слова (имя, отчество), затем остальные:
  // «павл» → сначала Павлова, потом Лебедев Игорь Павлович
  const filtered = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
    if (!q) return options
    const rank = (label: string) => {
      const l = label.toLowerCase()
      if (l.startsWith(q)) return 0
      if (l.split(/\s+/).some((w) => w.startsWith(q))) return 1
      return l.includes(q) ? 2 : -1
    }
    return options
      .map((o) => ({ o, r: rank(o.label) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.o)
  }, [options, query])

  function pick(o: Option) {
    onChange(o.value)
    setQuery(null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        className={inputCls}
        placeholder={placeholder}
        disabled={disabled}
        value={query ?? selected?.label ?? ''}
        onFocus={(e) => { setOpen(true); setActive(0); e.target.select() }}
        onBlur={() => { blurTimer.current = window.setTimeout(() => { setOpen(false); setQuery(null) }, 150) }}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setActive(0)
          if (e.target.value === '') onChange(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
          if (e.key === 'Enter' && open && filtered[active]) { e.preventDefault(); pick(filtered[active]) }
          if (e.key === 'Escape') { setOpen(false); setQuery(null) }
        }}
      />
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {filtered.length === 0 && <li className="px-3 py-2 text-slate-500">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); window.clearTimeout(blurTimer.current); pick(o) }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-slate-100' : ''} ${o.value === value ? 'font-medium' : ''}`}
            >
              {o.label}
              {o.hint && <span className="ml-2 text-xs text-slate-500">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
