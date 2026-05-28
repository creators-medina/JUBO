'use client'

import { cn } from '@/lib/utils'
import { getLastContactedAt, daysSince, getContactHealth, getCommunicationCounts } from '../metrics'
import type { CommunicationLog, ContactHealth } from '../types'

const HEALTH_STYLE: Record<ContactHealth, { label: string; cls: string }> = {
  healthy: { label: 'Healthy', cls: 'text-emerald-400' },
  warming: { label: 'Warming', cls: 'text-amber-400' },
  stale:   { label: 'Stale', cls: 'text-red-400' },
  unknown: { label: 'No contact yet', cls: 'text-muted-foreground' },
}

export function LastContactCard({ logs }: { logs: CommunicationLog[] }) {
  const health = getContactHealth(logs)
  const last = getLastContactedAt(logs)
  const d = daysSince(last)
  const counts = getCommunicationCounts(logs)
  const style = HEALTH_STYLE[health]

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Last contact</p>
        <span className={cn('text-2xs font-medium', style.cls)}>{style.label}</span>
      </div>
      <p className="text-sm text-foreground">
        {d == null ? 'No communication logged' : d === 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'} ago`}
      </p>
      {counts.total > 0 && (
        <p className="mt-1 text-2xs text-muted-foreground">
          {counts.total} logged · {counts.connected} connected
          {counts.noAnswerStreak >= 2 && <span className="text-amber-400"> · {counts.noAnswerStreak} no-answers in a row</span>}
        </p>
      )}
    </div>
  )
}
