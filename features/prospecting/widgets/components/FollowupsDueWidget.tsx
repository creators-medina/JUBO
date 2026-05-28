'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveFollowUp } from '@/features/communications/actions'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'
import type { FollowupsDueData } from '../types'

export function FollowupsDueWidget({ data, onRecordClick }: { data: FollowupsDueData; onRecordClick?: (recordId: string) => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (data.items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <Check className="h-5 w-5 text-emerald-400" />
        <p className="text-xs text-muted-foreground">No follow-ups due — all clear</p>
      </div>
    )
  }

  const resolve = (id: string) => {
    startTransition(async () => {
      await resolveFollowUp(id)
      router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col gap-1.5 overflow-y-auto">
      {data.items.map((it) => (
        <div key={it.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-1">
          <CalendarClock className={cn('h-3.5 w-3.5 flex-shrink-0', it.overdue ? 'text-red-400' : 'text-amber-400')} />
          <button onClick={() => onRecordClick?.(it.recordId)} className="min-w-0 flex-1 text-left">
            <p className="truncate text-xs font-medium text-foreground">{it.recordTitle ?? 'Untitled'}</p>
            <p className="truncate text-2xs text-muted-foreground">
              {it.overdue ? 'Overdue' : 'Due today'}
              {it.outcome ? ` · ${OUTCOME_LABEL[it.outcome as CommunicationOutcome] ?? it.outcome}` : ''}
            </p>
          </button>
          <button
            onClick={() => resolve(it.id)}
            disabled={pending}
            title="Mark resolved"
            className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-emerald-400 disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
