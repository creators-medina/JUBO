'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { sendSMS } from '../actions'

const ERR: Record<string, string> = {
  phone_opted_out: 'This contact opted out of texts.',
  twilio_not_configured: 'Connect Twilio in Settings → Communications first.',
  outbound_disabled: 'Outbound texting is disabled.',
  no_phone: 'No phone number on file for this contact.',
  empty_message: 'Type a message first.',
}

export function SMSComposeBox({
  threadId, recordId, toPhone, participantPhone, compact, onSent,
}: {
  threadId?: string | null
  recordId?: string | null
  toPhone?: string | null
  participantPhone?: string | null
  compact?: boolean
  onSent?: (threadId: string) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  const send = () => {
    const text = body.trim()
    if (!text || pending) return
    startTransition(async () => {
      const res = await sendSMS({ threadId, recordId, toPhone, body: text })
      if ('error' in res) { toast.error(ERR[res.error] ?? 'Could not send message.'); return }
      setBody('')
      toast.success('Message sent')
      onSent?.(res.threadId)
      router.refresh()
    })
  }

  return (
    <div className={cn('flex items-end gap-2 border-t border-border bg-card p-3', compact && 'p-2')}>
      <div className="flex-1">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
          rows={compact ? 1 : 2}
          placeholder={participantPhone ? `Message ${participantPhone}…` : 'Type a message…'}
          className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
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
  )
}
