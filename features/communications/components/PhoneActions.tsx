'use client'

import { useState, useTransition } from 'react'
import { PhoneCall, Copy, Check, PhoneOff, Voicemail, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { quickCallOutcome } from '@/features/communications/actions'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'

const QUICK: { outcome: CommunicationOutcome; label: string; icon: React.ElementType; tone?: string }[] = [
  { outcome: 'connected', label: 'Connected', icon: PhoneCall, tone: 'text-jubo-green' },
  { outcome: 'no_answer', label: 'No answer', icon: PhoneOff },
  { outcome: 'voicemail', label: 'Voicemail', icon: Voicemail },
  { outcome: 'follow_up_needed', label: 'Follow-up', icon: CalendarClock, tone: 'text-jubo-gold' },
]

/**
 * Click-to-call affordance: tel: link (opens the LO's own dialer) + copy-number,
 * and — unless compact — quick outcome buttons that log via quickCallOutcome.
 * Renders nothing without a phone.
 */
export function PhoneActions({
  phone, recordId, compact = false, showOutcomes = true, onOutcomeLogged,
}: {
  phone: string | null | undefined
  recordId: string
  compact?: boolean
  showOutcomes?: boolean
  onOutcomeLogged?: () => void
}) {
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  if (!phone) return null

  const copy = () => {
    navigator.clipboard?.writeText(phone).then(
      () => { setCopied(true); toast.success('Number copied'); setTimeout(() => setCopied(false), 1500) },
      () => toast.error('Could not copy'),
    )
  }

  const log = (o: CommunicationOutcome) => startTransition(async () => {
    const r = await quickCallOutcome(recordId, o)
    if (r && 'error' in r) { toast.error('Could not log outcome'); return }
    toast.success(`Logged ${OUTCOME_LABEL[o]}`)
    onOutcomeLogged?.()
  })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <a href={`tel:${phone}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90">
        <PhoneCall className="h-3.5 w-3.5" /> Call
      </a>
      <button onClick={copy} title="Copy number"
        className="inline-flex items-center rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
        {copied ? <Check className="h-3.5 w-3.5 text-jubo-green" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {!compact && showOutcomes && QUICK.map((q) => (
        <button key={q.outcome} onClick={() => log(q.outcome)} disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">
          <q.icon className={cn('h-3.5 w-3.5', q.tone ?? 'text-muted-foreground')} /> {q.label}
        </button>
      ))}
    </div>
  )
}
