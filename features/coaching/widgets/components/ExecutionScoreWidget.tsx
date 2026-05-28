'use client'

import { Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ExecutionScoreData } from '../types'

const TONE: Record<string, string> = {
  excellent: 'text-emerald-400',
  good: 'text-emerald-400',
  fair: 'text-amber-400',
  needs_work: 'text-red-400',
}

export function ExecutionScoreWidget({ data }: { data: ExecutionScoreData }) {
  const accent = TONE[data.interpretation] ?? 'text-foreground'
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Execution score</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-4xl font-semibold tabular-nums', accent)}>{data.overall}</span>
        <span className={cn('text-xs font-medium capitalize', accent)}>{data.interpretation.replace('_', ' ')}</span>
      </div>
      <div className="mt-auto space-y-1.5">
        {data.factors.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <span className="w-28 flex-shrink-0 truncate text-2xs text-muted-foreground">{f.label}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${f.value}%` }} />
            </div>
            <span className="w-7 flex-shrink-0 text-right text-2xs tabular-nums text-muted-foreground">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
