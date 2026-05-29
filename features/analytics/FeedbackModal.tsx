'use client'

import { useState, useTransition } from 'react'
import { X, Bug, Lightbulb, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { submitFeedback } from './actions'

const TYPES = [
  { id: 'bug', label: 'Bug', icon: Bug },
  { id: 'feature', label: 'Feature', icon: Lightbulb },
  { id: 'general', label: 'General', icon: MessageSquare },
]

export function FeedbackModal({ initialType = 'general', onClose }: { initialType?: string; onClose: () => void }) {
  const toast = useToast()
  const [type, setType] = useState(initialType)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    if (!title.trim() || pending) return
    startTransition(async () => {
      const res = await submitFeedback({
        type, title, description,
        metadata: { pathname: typeof window !== 'undefined' ? window.location.pathname : null },
      })
      if ('error' in res) { toast.error('Could not send feedback'); return }
      toast.success('Thanks — feedback sent')
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Send feedback</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex gap-2">
            {TYPES.map((t) => (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                  type === t.id ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:text-foreground')}>
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="Short summary"
            className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="What happened, or what would help? (optional)"
            className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            <button onClick={submit} disabled={pending || !title.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {pending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
