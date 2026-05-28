'use client'

import { Handshake } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PartnerGrowthData, PartnerStatus } from '../types'

const DOT: Record<PartnerStatus, string> = {
  active: 'bg-emerald-400',
  cooling_off: 'bg-amber-400',
  at_risk: 'bg-red-400',
  dormant: 'bg-surface-3',
}

export function PartnerGrowthWidget({ data, onRecordClick }: { data: PartnerGrowthData; onRecordClick?: (recordId: string) => void }) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Handshake className="h-4 w-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Partner growth</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Cell label="Active" value={data.activePartners} accent="text-emerald-400" />
        <Cell label="Needed" value={data.partnersNeeded} accent="text-foreground" />
        <Cell label="Gap" value={data.partnerGap} accent={data.partnerGap > 0 ? 'text-amber-400' : 'text-emerald-400'} />
      </div>
      <div className="mt-1 flex-1 space-y-1 overflow-y-auto">
        {data.leaders.length === 0 ? (
          <p className="text-2xs text-muted-foreground">No partner records yet.</p>
        ) : data.leaders.map((p) => (
          <button key={p.recordId} onClick={() => onRecordClick?.(p.recordId)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-1">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', DOT[p.status])} />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{p.name}</span>
            <span className="flex-shrink-0 text-2xs tabular-nums text-muted-foreground">{p.leadsYtd} leads</span>
          </button>
        ))}
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
