'use client'

import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HelpTip } from '@/components/primitives/HelpTip'
import type { TalkToPaceData } from '../types'

const STATUS: Record<TalkToPaceData['status'], string> = {
  ahead: 'text-emerald-400',
  on_pace: 'text-amber-400',
  behind: 'text-red-400',
}

export function TalkToPaceWidget({ data }: { data: TalkToPaceData }) {
  const pct = Math.min(100, data.pacePercent)
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Talk-to pace</p>
        <HelpTip text="Real conversations (not dials) vs the daily/weekly target Jubo reverse-engineered from your income goal." />
        <span className="ml-auto text-2xs capitalize text-muted-foreground">{data.cadence}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums text-foreground">{data.actual}</span>
        <span className="text-sm text-muted-foreground">/ {data.target} conversations</span>
      </div>
      <div className="mt-auto space-y-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className={cn('text-2xs font-medium capitalize', STATUS[data.status])}>{data.status.replace('_', ' ')}</span>
          <span className="text-2xs text-muted-foreground">{data.remaining > 0 ? `${data.remaining} to go · ` : ''}{data.source}</span>
        </div>
      </div>
    </div>
  )
}
