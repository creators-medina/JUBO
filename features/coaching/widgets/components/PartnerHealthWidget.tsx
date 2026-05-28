'use client'

import { HeartPulse } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PartnerHealthData } from '../types'

export function PartnerHealthWidget({ data, onRecordClick }: { data: PartnerHealthData; onRecordClick?: (recordId: string) => void }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Partner health</p>
        <span className="ml-auto text-2xs text-muted-foreground">{data.total} total</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Pill label="Active" value={data.active} accent="text-emerald-400" />
        <Pill label="Cooling" value={data.coolingOff} accent="text-amber-400" />
        <Pill label="At risk" value={data.atRisk} accent="text-red-400" />
        <Pill label="Dormant" value={data.dormant} accent="text-muted-foreground" />
      </div>
      <div className="mt-1 flex-1 space-y-1 overflow-y-auto">
        {data.topAtRisk.length === 0 ? (
          <p className="text-2xs text-muted-foreground">No partners need attention. Nice.</p>
        ) : (
          <>
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Reconnect</p>
            {data.topAtRisk.map((p) => (
              <button key={p.recordId} onClick={() => onRecordClick?.(p.recordId)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-1">
                <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
                <span className="flex-shrink-0 text-2xs tabular-nums text-muted-foreground">
                  {p.daysSinceContact == null ? 'never' : `${p.daysSinceContact}d`}
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function Pill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-surface-1 px-2 py-1.5">
      <p className={cn('text-base font-semibold tabular-nums', accent)}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}
