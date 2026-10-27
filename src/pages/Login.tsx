import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { btn, Card, inputCls } from '../components/ui'
import * as api from '../data/api'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.signIn(email.trim(), password)
      navigate('/hr/requests', { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-semibold">График отпусков</h1>
        <p className="mb-5 text-sm text-slate-500">Вход для отдела персонала</p>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input type="email" autoComplete="username" autoFocus className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Пароль</span>
            <input type="password" autoComplete="current-password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button type="submit" className={`${btn.primary} w-full`} disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
        </form>
      </Card>
    </div>
  )
}
