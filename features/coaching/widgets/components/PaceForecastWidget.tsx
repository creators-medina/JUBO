'use client'

import { LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PaceForecastData } from '../types'

function fmt(n: number, currency: boolean): string {
  if (currency) return n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`
  return `${Math.round(n)}`
}

export function PaceForecastWidget({ data }: { data: PaceForecastData }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <LineChart className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Pace forecast</p>
      </div>
      {data.rows.length === 0 ? (
        <p className="text-2xs text-muted-foreground">Set an income goal to see projections.</p>
      ) : (
        <div className="flex-1 space-y-2">
          {data.rows.map((r) => {
            const accent = r.onTrack ? 'text-jubo-green' : 'text-jubo-gold'
            const pct = r.target > 0 ? Math.min(100, Math.round((r.projected / r.target) * 100)) : 0
            return (
              <div key={r.metric} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="tabular-nums text-foreground">
                    {fmt(r.projected, r.isCurrency)} <span className="text-muted-foreground">/ {fmt(r.target, r.isCurrency)}</span>
                    <span className={cn('ml-1.5', accent)}>{r.variancePercent >= 0 ? '+' : ''}{r.variancePercent}%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full', r.onTrack ? 'bg-jubo-green' : 'bg-jubo-gold')} style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
