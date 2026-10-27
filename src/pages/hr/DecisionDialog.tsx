import { useState } from 'react'
import { btn, inputCls } from '../../components/ui'
import { useEscape } from '../../components/useEscape'
import { TEMPLATE_KIND_BY_DECISION, correctionLink, renderTemplate } from '../../domain/messages'
import type { VacationRequest } from '../../domain/types'
import { useAppData } from '../../state/appDataContext'
import { decide, type Decision } from '../../state/decisions'

// Ссылки в сообщениях ведут на публичный адрес приложения, даже если HR работает с другого адреса
const PUBLIC_URL = (import.meta.env.VITE_PUBLIC_URL as string | undefined) || window.location.origin

const TEXT: Record<Decision, { title: string; field?: string; placeholder?: string; submit: string; style: string }> = {
  'согласована': { title: 'Согласовать заявку', submit: 'Согласовать и отправить', style: btn.green },
  'отклонена': {
    title: 'Отклонить заявку',
    field: 'Причина (попадёт в сообщение сотруднику)',
    placeholder: 'например: в эти даты в отпуске руководитель',
    submit: 'Отклонить и отправить',
    style: btn.red,
  },
  'согласована как исключение': {
    title: 'Согласовать как исключение',
    field: 'Комментарий HR (обязательно)',
    placeholder: 'почему допускается исключение',
    submit: 'Согласовать как исключение',
    style: btn.violet,
  },
}

export default function DecisionDialog({ request, decision, onClose }: { request: VacationRequest; decision: Decision; onClose: () => void }) {
  const { templates, employeeById, reload } = useAppData()
  useEscape(onClose)
  const t = TEXT[decision]
  const [comment, setComment] = useState('')
  const [editedMessage, setEditedMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templates.find((x) => x.kind === TEMPLATE_KIND_BY_DECISION[decision])?.text ?? ''
  const generated = renderTemplate(template, {
    employee: employeeById.get(request.employee_id)!,
    request,
    reason: comment.trim() || '…',
    link: correctionLink(request, PUBLIC_URL),
  })
  const message = editedMessage ?? generated
  const canSubmit = !busy && (!t.field || comment.trim() !== '') && message.trim() !== ''

  async function submit() {
    setBusy(true)
    try {
      await decide(request, decision, comment.trim() || null, message)
      await reload()
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
      // Заявку могли обработать в другом окне — подтягиваем актуальный статус
      void reload()
    }
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl space-y-4 rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        {t.field && (
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">{t.field}</span>
            <textarea autoFocus rows={2} className={inputCls} placeholder={t.placeholder} value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 flex justify-between text-slate-600">
            Сообщение сотруднику (по шаблону, можно поправить)
            {editedMessage !== null && (
              <button className="text-xs text-sky-700 underline" onClick={() => setEditedMessage(null)}>вернуть шаблон</button>
            )}
          </span>
          <textarea rows={8} className={`${inputCls} font-mono text-xs`} value={message} onChange={(e) => setEditedMessage(e.target.value)} />
        </label>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button className={btn.ghost} onClick={onClose}>Отмена</button>
          <button className={t.style} disabled={!canSubmit} onClick={submit}>{busy ? 'Сохраняем…' : t.submit}</button>
        </div>
      </div>
    </div>
  )
}
