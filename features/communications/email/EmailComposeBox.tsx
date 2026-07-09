'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase B — Real email compose box for the Communicate tab. Sends via the
// sendEmail action (Resend) and logs into the unified timeline. Mirrors
// SMSComposeBox ergonomics (⌘↵ to send, templates optional later).
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { useToast } from '@/features/feedback/ToastProvider'
import { sendEmail } from './actions'

const ERR: Record<string, string> = {
  email_not_configured: 'Connect Resend in Settings → Communications first.',
  no_email: 'No email address on file for this contact.',
  empty_subject: 'Add a subject first.',
  empty_body: 'Write a message first.',
}

export function EmailComposeBox({
  recordId, toEmail, onSent,
}: {
  recordId: string
  toEmail: string
  onSent?: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  const send = () => {
    if (!subject.trim() || !body.trim() || pending) return
    startTransition(async () => {
      const res = await sendEmail({ recordId, toEmail, subject, body })
      if ('error' in res) { toast.error(ERR[res.error] ?? 'Could not send email.'); return }
      setSubject(''); setBody('')
      toast.success(res.logged ? 'Email sent' : 'Email sent (timeline log failed)')
      onSent?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <input
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Subject"
        className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() } }}
        rows={4}
        placeholder={`Message ${toEmail}…`}
        className="w-full resize-none rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <div className="flex items-center justify-between">
        <p className="text-2xs text-muted-foreground">⌘↵ to send</p>
        <button
          onClick={send}
          disabled={pending || !subject.trim() || !body.trim()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> Send email
        </button>
      </div>
    </div>
  )
}
