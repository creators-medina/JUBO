'use client'

import { Phone, Mail, MessageSquare, Calendar, StickyNote, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CHANNEL_LABEL, OUTCOME_LABEL, type CommunicationChannel, type CommunicationLog } from '../types'

const CHANNEL_ICON: Record<CommunicationChannel, React.ElementType> = {
  call: Phone, email: Mail, sms: MessageSquare, meeting: Calendar, internal: StickyNote,
}

function when(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function RecentCommunications({ logs, limit = 6 }: { logs: CommunicationLog[]; limit?: number }) {
  if (logs.length === 0) return null
  const recent = [...logs].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, limit)

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Communications</h3>
      <div className="space-y-2.5">
        {recent.map((l) => {
          const Icon = CHANNEL_ICON[l.channel]
          return (
            <div key={l.id} className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground capitalize">{l.direction} {CHANNEL_LABEL[l.channel].toLowerCase()}</span>
                  {l.outcome && (
                    <span className={cn('rounded px-1.5 py-0.5 text-2xs font-medium',
                      l.outcome === 'connected' || l.outcome === 'completed' ? 'bg-jubo-green-soft text-jubo-green'
                      : l.outcome === 'follow_up_needed' ? 'bg-jubo-gold-soft text-jubo-gold'
                      : 'bg-surface-2 text-muted-foreground')}>
                      {OUTCOME_LABEL[l.outcome]}
                    </span>
                  )}
                  <span className="ml-auto text-2xs text-muted-foreground">{when(l.occurred_at)}</span>
                </div>
                {(l.summary || l.subject) && <p className="mt-0.5 text-xs text-muted-foreground">{l.summary ?? l.subject}</p>}
                {l.follow_up_at && (
                  <p className="mt-0.5 inline-flex items-center gap-1 text-2xs text-jubo-gold">
                    <CalendarClock className="h-3 w-3" /> Follow-up {new Date(l.follow_up_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
