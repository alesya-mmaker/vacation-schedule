import { useState } from 'react'
import * as api from '../../data/api'
import { btn, Card, inputCls } from '../../components/ui'
import type { MessageTemplate, TemplateKind } from '../../domain/types'
import { useAppData } from '../../state/appDataContext'

const TITLES: Record<TemplateKind, string> = {
  'отказ': 'Отказ',
  'согласование': 'Согласование',
  'исключение': 'Согласование как исключение',
}

const PLACEHOLDERS = [
  ['{ФИО}', 'ФИО сотрудника'],
  ['{даты}', 'даты отпуска'],
  ['{причина}', 'причина отказа или комментарий HR к исключению'],
  ['{ссылка}', 'ссылка на форму с подставленными ФИО и номером прежней заявки'],
]

function TemplateEditor({ template }: { template: MessageTemplate }) {
  const { reload } = useAppData()
  const [text, setText] = useState(template.text)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const dirty = text !== template.text

  async function save() {
    setState('saving')
    setError(null)
    try {
      await api.updateTemplate(template.id, text)
      await reload()
      setState('saved')
    } catch (e) {
      setError((e as Error).message)
      setState('idle')
    }
  }

  return (
    <Card title={TITLES[template.kind]}>
      <textarea
        rows={8}
        className={`${inputCls} font-mono text-xs`}
        value={text}
        onChange={(e) => { setText(e.target.value); setState('idle') }}
      />
      <div className="mt-3 flex items-center gap-3">
        <button className={btn.primary} disabled={!dirty || state === 'saving'} onClick={save}>
          {state === 'saving' ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {dirty && <button className="text-sm text-slate-500 underline" onClick={() => setText(template.text)}>Отменить изменения</button>}
        {state === 'saved' && !dirty && <span className="text-sm text-emerald-700">Сохранено</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>
    </Card>
  )
}

export default function Templates() {
  const { templates } = useAppData()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Шаблоны сообщений</h1>
      <Card>
        <p className="mb-2 text-sm text-slate-600">При отправке подставляются:</p>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {PLACEHOLDERS.map(([code, label]) => (
            <li key={code}><code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{code}</code> — {label}</li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        {templates.map((t) => <TemplateEditor key={t.id} template={t} />)}
      </div>
    </div>
  )
}
