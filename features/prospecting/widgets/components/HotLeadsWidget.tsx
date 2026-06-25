'use client'

import { Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HotLeadsData } from '../types'
import type { LeadTemperature } from '../../types'

const TEMP: Record<LeadTemperature, { dot: string; label: string; cls: string }> = {
  hot:     { dot: 'bg-jubo-red',    label: 'Hot',  cls: 'text-jubo-red' },
  warm:    { dot: 'bg-jubo-gold',  label: 'Warm', cls: 'text-jubo-gold' },
  cold:    { dot: 'bg-jubo-navy',   label: 'Cold', cls: 'text-jubo-navy' },
  dormant: { dot: 'bg-surface-3',  label: 'Dormant', cls: 'text-muted-foreground' },
}

export function HotLeadsWidget({ data, onRecordClick }: { data: HotLeadsData; onRecordClick?: (recordId: string) => void }) {
  if (data.leads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <Flame className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">No hot leads in the queue</p>
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto">
      {data.leads.map((l) => {
        const t = TEMP[l.temperature]
        return (
          <button
            key={l.recordId}
            onClick={() => onRecordClick?.(l.recordId)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-1"
          >
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', t.dot)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{l.title}</p>
              <p className="truncate text-2xs text-muted-foreground">
                {l.reason ?? (l.daysSinceContact != null ? `${l.daysSinceContact}d since contact` : 'In queue')}
              </p>
            </div>
            <span className={cn('flex-shrink-0 text-2xs font-medium', t.cls)}>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
