import { useEffect, useState } from 'react'
import { Navigate, NavLink, Outlet } from 'react-router-dom'
import * as api from '../../data/api'
import { AppDataProvider } from '../../state/AppData'
import { useAppData } from '../../state/appDataContext'

const TABS = [
  { to: '/hr/requests', label: 'Заявки' },
  { to: '/hr/timeline', label: 'График' },
  { to: '/hr/rules', label: 'Правила' },
  { to: '/hr/templates', label: 'Шаблоны' },
  { to: '/hr/outbox', label: 'Исходящие' },
  { to: '/hr/employees', label: 'Сотрудники' },
]

// Число новых (ещё не открытых HR) заявок — рядом с вкладкой «Заявки»
function NewBadge() {
  const { requests } = useAppData()
  const count = requests.filter((r) => !r.viewed_at && r.status !== 'заменена').length
  if (count === 0) return null
  return <span title="Новые, ещё не открытые заявки" className="ml-1.5 rounded-full bg-sky-500 px-1.5 text-xs font-semibold text-white">{count}</span>
}

// Раздел HR: доступен только после входа. Без входа — на страницу входа.
export default function HrLayout() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    void api.isSignedIn().then(setSignedIn)
    return api.onAuthChange(setSignedIn)
  }, [])

  if (signedIn === null) return null
  if (!signedIn) return <Navigate to="/login" replace />

  return (
    <AppDataProvider>
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <span className="text-lg font-semibold">График отпусков</span>
          <nav className="flex flex-wrap gap-1 text-sm">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) => `rounded-md px-3 py-1.5 ${isActive ? 'bg-slate-100 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {t.label}
                {t.to === '/hr/requests' && <NewBadge />}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <a href="/form" target="_blank" rel="noreferrer" className="text-sky-700 underline">Форма для сотрудников ↗</a>
            <button className="text-slate-600 hover:text-slate-900" onClick={() => api.signOut()}>Выйти</button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
    </AppDataProvider>
  )
}
