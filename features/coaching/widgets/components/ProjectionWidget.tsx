'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjectionData } from '../types'

function fmt(n: number, currency: boolean): string {
  if (currency) {
    if (n >= 1000) return `$${Math.round(n / 1000)}k`
    return `$${Math.round(n)}`
  }
  return `${Math.round(n)}`
}

export function ProjectionWidget({ data }: { data: ProjectionData }) {
  const ahead = data.variancePercent >= 0
  const accent = data.onTrack ? 'text-jubo-green' : 'text-jubo-gold'
  const Icon = ahead ? TrendingUp : TrendingDown
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', accent)} />
        <p className="text-xs font-medium text-foreground">{data.label}</p>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-3xl font-semibold tabular-nums', accent)}>{fmt(data.projected, data.isCurrency)}</span>
        <span className="text-xs text-muted-foreground">of {fmt(data.target, data.isCurrency)}</span>
      </div>
      <p className="mt-auto text-2xs text-muted-foreground">
        {data.current > 0 ? `${fmt(data.current, data.isCurrency)} so far · ` : ''}
        <span className={accent}>{ahead ? '+' : ''}{data.variancePercent}% vs goal</span> on current pace
      </p>
    </div>
  )
}
