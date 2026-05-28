'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConnectionRateData } from '../types'

export function ConnectionRateWidget({ data }: { data: ConnectionRateData }) {
  const trendPts = Math.round(data.trend * 100)
  const TrendIcon = trendPts > 0 ? TrendingUp : trendPts < 0 ? TrendingDown : Minus
  const trendCls = trendPts > 0 ? 'text-emerald-400' : trendPts < 0 ? 'text-red-400' : 'text-muted-foreground'

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Connection rate</p>
        <span className={cn('ml-auto inline-flex items-center gap-1 text-2xs font-medium', trendCls)}>
          <TrendIcon className="h-3 w-3" />
          {trendPts > 0 ? '+' : ''}{trendPts} pts
        </span>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-2">
        <Stat label="Today" rate={data.todayRate} sub={`${data.todayConnects}/${data.todayCalls} calls`} accent="text-primary" />
        <Stat label="This week" rate={data.weekRate} sub={`${data.weekConnects}/${data.weekCalls} calls`} accent="text-foreground" />
      </div>
    </div>
  )
}

function Stat({ label, rate, sub, accent }: { label: string; rate: number; sub: string; accent: string }) {
  return (
    <div className="flex flex-col justify-center gap-0.5 rounded-md bg-surface-1 px-2 py-1.5">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-2xl font-semibold tabular-nums', accent)}>{Math.round(rate * 100)}%</p>
      <p className="text-2xs text-muted-foreground">{sub}</p>
    </div>
  )
}
