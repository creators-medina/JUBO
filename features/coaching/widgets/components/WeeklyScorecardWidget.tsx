'use client'

import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WeeklyScorecardData } from '../types'

const STATUS_BG: Record<string, string> = {
  ahead: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  on_pace: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  behind: 'bg-red-500/15 text-red-300 border-red-500/30',
  none: 'bg-surface-1 text-muted-foreground border-border',
}

export function WeeklyScorecardWidget({ data }: { data: WeeklyScorecardData }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Weekly scorecard</p>
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">score {data.weeklyScore}</span>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {data.days.map((d, i) => (
          <div key={i} className={cn('flex flex-col items-center gap-0.5 rounded-md border py-1.5', STATUS_BG[d.status])}>
            <span className="text-2xs">{d.label}</span>
            <span className="text-sm font-semibold tabular-nums">{d.status === 'none' ? '·' : d.score}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto grid grid-cols-3 gap-2 text-center">
        <Stat label="Talk-tos" value={`${data.talkTos}/${data.talkToTarget}`} />
        <Stat label="Partner" value={data.partnersTouched} />
        <Stat label="Score" value={data.weeklyScore} />
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md bg-surface-1 px-2 py-1.5">
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}
