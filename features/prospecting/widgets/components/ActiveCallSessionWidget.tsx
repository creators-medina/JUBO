'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Radio, Play, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { startProspectingSession, endProspectingSession } from '../../sessions/actions'
import type { ActiveCallSessionData } from '../types'

function durationLabel(startedAt: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

export function ActiveCallSessionWidget({ data }: { data: ActiveCallSessionData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const start = () => startTransition(async () => { await startProspectingSession(data.organizationId, data.target); router.refresh() })
  const end = () => startTransition(async () => { if (data.sessionId) { await endProspectingSession(data.sessionId); router.refresh() } })

  if (!data.active || !data.startedAt) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Radio className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No active call session</p>
        <button
          onClick={start}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> Start session
        </button>
      </div>
    )
  }

  const pct = Math.min(100, Math.round((data.attempted / Math.max(1, data.target)) * 100))
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
        </span>
        <span className="text-2xs text-muted-foreground">{durationLabel(data.startedAt)}</span>
        <button
          onClick={end}
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-2 py-1 text-2xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          <Square className="h-3 w-3" /> End
        </button>
      </div>

      <div className="grid flex-1 grid-cols-3 gap-2">
        <Cell label="Calls" value={data.attempted} accent="text-primary" />
        <Cell label="Connect" value={data.connected} accent="text-emerald-400" />
        <Cell label="Booked" value={data.meetings} accent="text-foreground" />
      </div>

      <div className="space-y-1">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-2xs text-muted-foreground">{data.attempted}/{data.target} calls</p>
      </div>
    </div>
  )
}

function Cell({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-1 px-2 py-1.5">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-base font-semibold tabular-nums', accent)}>{value}</p>
    </div>
  )
}
