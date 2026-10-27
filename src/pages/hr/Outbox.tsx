import { Link } from 'react-router-dom'
import { Card } from '../../components/ui'
import type { TemplateKind } from '../../domain/types'
import { formatDate, localDate } from '../../rules/dates'
import { useAppData } from '../../state/appDataContext'

const KIND_STYLE: Record<TemplateKind, string> = {
  'отказ': 'bg-red-100 text-red-800',
  'согласование': 'bg-emerald-100 text-emerald-800',
  'исключение': 'bg-violet-100 text-violet-800',
}

const time = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Minsk', hour: '2-digit', minute: '2-digit' })

// Ссылки на форму в тексте сообщения делаем кликабельными, чтобы можно было пройти путь сотрудника
function MessageText({ text }: { text: string }) {
  const parts = text.split(/((?:https?:\/\/[^\s/]+)?\/form\?\S+)/)
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-700">
      {parts.map((p, i) => {
        if (i % 2 === 0) return p
        const path = p.replace(/^https?:\/\/[^\s/]+/, '')
        return <Link key={i} to={path} className="break-all text-sky-700 underline">{p}</Link>
      })}
    </p>
  )
}

export default function Outbox() {
  const { outbox, employeeById } = useAppData()
  const messages = [...outbox].sort((a, b) => b.sent_at.localeCompare(a.sent_at))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Исходящие</h1>
        <p className="text-sm text-slate-500">Сообщения сотрудникам. В прототипе они не отправляются, а записываются сюда.</p>
      </div>
      {messages.length === 0 && <p className="text-slate-500">Сообщений пока нет.</p>}
      {messages.map((m) => (
        <Card key={m.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{employeeById.get(m.employee_id)?.full_name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KIND_STYLE[m.kind]}`}>{m.kind}</span>
            {m.request_id && <Link to={`/hr/requests/${m.request_id}`} className="text-sky-700 underline">заявление №{m.request_id}</Link>}
            <span className="ml-auto text-xs text-slate-500">{formatDate(localDate(m.sent_at))} {time.format(new Date(m.sent_at))}</span>
          </div>
          <MessageText text={m.text} />
        </Card>
      ))}
    </div>
  )
}
