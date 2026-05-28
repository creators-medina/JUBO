'use client'

import { useState, useTransition } from 'react'
import { PhoneCall, PhoneOff, Voicemail, MessageSquare, CalendarClock, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { quickCallOutcome } from '../actions'
import { LogCommunicationModal } from './LogCommunicationModal'
import type { CommunicationOutcome } from '../types'

const QUICK: { outcome: CommunicationOutcome; label: string; icon: React.ElementType; tone: string }[] = [
  { outcome: 'connected', label: 'Connected', icon: PhoneCall, tone: 'text-emerald-400' },
  { outcome: 'no_answer', label: 'No answer', icon: PhoneOff, tone: 'text-muted-foreground' },
  { outcome: 'voicemail', label: 'Voicemail', icon: Voicemail, tone: 'text-muted-foreground' },
  { outcome: 'left_message', label: 'Left msg', icon: MessageSquare, tone: 'text-muted-foreground' },
  { outcome: 'follow_up_needed', label: 'Follow-up', icon: CalendarClock, tone: 'text-amber-400' },
]

export function CommunicationActions({ recordId, onChanged }: { recordId: string; onChanged?: () => void }) {
  const [pending, startTransition] = useTransition()
  const [modal, setModal] = useState(false)

  const quick = (outcome: CommunicationOutcome) =>
    startTransition(async () => { await quickCallOutcome(recordId, outcome); onChanged?.() })

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Log a call</p>
        <button onClick={() => setModal(true)} className="inline-flex items-center gap-1 text-2xs text-primary hover:underline">
          <Plus className="h-3 w-3" /> Log email / SMS / meeting
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q.outcome} onClick={() => quick(q.outcome)} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">
            <q.icon className={cn('h-3.5 w-3.5', q.tone)} /> {q.label}
          </button>
        ))}
      </div>
      {modal && (
        <LogCommunicationModal recordId={recordId} onClose={() => setModal(false)} onLogged={() => onChanged?.()} />
      )}
    </div>
  )
}
