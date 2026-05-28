'use client'

import { Check, CheckCheck, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConversationMessage, DeliveryStatus } from '../types'

function StatusIcon({ status }: { status: DeliveryStatus }) {
  if (status === 'failed' || status === 'undelivered') return <AlertCircle className="h-3 w-3 text-red-300" />
  if (status === 'delivered') return <CheckCheck className="h-3 w-3 text-emerald-200/80" />
  if (status === 'sent') return <Check className="h-3 w-3 text-primary-foreground/70" />
  if (status === 'queued' || status === 'sending') return <Clock className="h-3 w-3 text-primary-foreground/60" />
  return null
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function ConversationTimeline({ messages, compact }: { messages: ConversationMessage[]; compact?: boolean }) {
  if (messages.length === 0) {
    return <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-muted-foreground">No messages yet. Say hello.</div>
  }
  return (
    <div className={cn('flex flex-col gap-2 overflow-y-auto p-4', compact && 'gap-1.5 p-3')}>
      {messages.map((m) => {
        const out = m.direction === 'outbound'
        return (
          <div key={m.id} className={cn('flex', out ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[78%] rounded-2xl px-3 py-2', out ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-foreground')}>
              <p className={cn('whitespace-pre-wrap break-words', compact ? 'text-xs' : 'text-sm')}>{m.body}</p>
              <div className={cn('mt-1 flex items-center gap-1', out ? 'justify-end text-primary-foreground/70' : 'text-muted-foreground')}>
                <span className="text-[10px] tabular-nums">{timeLabel(m.occurred_at)}</span>
                {out && <StatusIcon status={m.deliveryStatus} />}
              </div>
              {m.errorMessage && out && <p className="mt-0.5 text-[10px] text-red-300">Failed · {m.errorMessage}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
