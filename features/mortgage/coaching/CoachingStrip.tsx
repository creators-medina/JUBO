'use client'

import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildCoaching, type CoachTone } from './coach'

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Sparkles
  return <C className={className} />
}

const TONE: Record<CoachTone, string> = {
  good: 'text-emerald-400',
  warn: 'text-amber-400',
  urgent: 'text-red-400',
  info: 'text-muted-foreground',
}

export function CoachingStrip({
  summary, paces, staleCount, attentionViews, followUpsDue = 0, callsToday = 0, callGoal = 0,
  connectionRate = 0, sessionActive = false,
}: {
  summary: { total: number; completed: number; open: number; paceStatus: string }
  paces: { goal_name: string; status: string; pace_percent: number; daily_target?: number }[]
  staleCount: number
  attentionViews: { count: number }[]
  followUpsDue?: number
  callsToday?: number
  callGoal?: number
  connectionRate?: number
  sessionActive?: boolean
}) {
  const lines = buildCoaching({ summary, paces, staleCount, attentionViews, followUpsDue, callsToday, callGoal, connectionRate, sessionActive })
  if (lines.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-surface-1 to-card p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Icons.Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your day, coached</h2>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <Icon name={l.icon} className={cn('h-4 w-4 flex-shrink-0', TONE[l.tone])} />
            <span className="text-sm text-foreground">{l.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
