'use client'

import Link from 'next/link'
import { PhoneCall, PhoneIncoming, Percent, Target, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProspectingSummaryData } from '../types'

export function ProspectingSummaryWidget({ data }: { data: ProspectingSummaryData }) {
  const pct = Math.min(100, Math.round((data.callsToday / Math.max(1, data.target)) * 100))
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Prospecting today</p>
        {data.sessionActive && (
          <span className="ml-auto inline-flex items-center gap-1 text-2xs text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
          </span>
        )}
      </div>

      <div className="grid flex-1 grid-cols-4 gap-2">
        <Cell label="Calls"   value={data.callsToday}                              icon={PhoneCall}    accent="text-primary" />
        <Cell label="Connect" value={data.connectsToday}                          icon={PhoneIncoming} accent="text-emerald-400" />
        <Cell label="Rate"    value={`${Math.round(data.connectionRate * 100)}%`}  icon={Percent}      accent="text-foreground" />
        <Cell label="To goal" value={data.remaining}                              icon={Target}       accent={data.remaining === 0 ? 'text-emerald-400' : 'text-amber-400'} />
      </div>

      <div className="space-y-1.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-2xs text-muted-foreground">{data.callsToday}/{data.target} · {data.targetLabel}</p>
          <Link href="/prospecting" className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
            Open <ChevronRight className="h-2.5 w-2.5" />
          </Link>
        </div>
      </div>
    </div>
  )
}

function Cell({ label, value, icon: Icon, accent }: { label: string; value: number | string; icon: React.ElementType; accent: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-1 px-2 py-1.5">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={cn('h-3 w-3', accent)} />
      </div>
      <p className={cn('text-base font-semibold tabular-nums', accent)}>{value}</p>
    </div>
  )
}
