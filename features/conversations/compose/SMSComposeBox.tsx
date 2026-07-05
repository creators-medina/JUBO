'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { sendSMS } from '../actions'
import { SMS_TEMPLATES, renderTemplate } from '@/features/communications/templates'

const ERR: Record<string, string> = {
  phone_opted_out: 'This contact opted out of texts.',
  twilio_not_configured: 'Connect Twilio in Settings → Communications first.',
  outbound_disabled: 'Outbound texting is disabled.',
  no_phone: 'No phone number on file for this contact.',
  empty_message: 'Type a message first.',
}

export function SMSComposeBox({
  threadId, recordId, toPhone, participantPhone, compact, onSent, onDraftChange,
}: {
  threadId?: string | null
  recordId?: string | null
  toPhone?: string | null
  participantPhone?: string | null
  compact?: boolean
  onSent?: (threadId: string) => void
  /** Mirrors the draft text to the host (e.g. so a modal can warn before
   *  closing over an unsent message). Display-only; never sends. */
  onDraftChange?: (text: string) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [body, setBody] = useState('')
  const setDraft = (text: string) => { setBody(text); onDraftChange?.(text) }
  const [showTemplates, setShowTemplates] = useState(false)
  const [pending, startTransition] = useTransition()

  const send = () => {
    const text = body.trim()
    if (!text || pending) return
    startTransition(async () => {
      const res = await sendSMS({ threadId, recordId, toPhone, body: text })
      if ('error' in res) { toast.error(ERR[res.error] ?? 'Could not send message.'); return }
      setDraft('')
      toast.success('Message sent')
      onSent?.(res.threadId)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      {showTemplates && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
          {SMS_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => { setDraft(renderTemplate(t.body)); setShowTemplates(false) }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-1">
              <p className="text-xs font-medium text-foreground">{t.name}</p>
              <p className="truncate text-2xs text-muted-foreground">{t.body}</p>
            </button>
          ))}
        </div>
      )}
      <div className={cn('flex items-end gap-2 border-t border-border bg-card p-3', compact && 'p-2')}>
        <button type="button" onClick={() => setShowTemplates((s) => !s)} title="Quick templates"
          className={cn('inline-flex h-9 flex-shrink-0 items-center rounded-lg border border-border bg-surface-1 px-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground', showTemplates && 'bg-surface-2 text-foreground')}>
          <FileText className="h-4 w-4" />
        </button>
        <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
          rows={compact ? 1 : 2}
          placeholder={participantPhone ? `Message ${participantPhone}…` : 'Type a message…'}
          className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {!compact && <p className="mt-1 text-2xs text-muted-foreground">{body.length} chars{body.length > 160 ? ` · ${Math.ceil(body.length / 153)} segments` : ''} · ⌘↵ to send</p>}
      </div>
      <button
        onClick={send}
        disabled={pending || !body.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        <Send className="h-4 w-4" /> {compact ? '' : 'Send'}
      </button>
      </div>
    </div>
  )
}
