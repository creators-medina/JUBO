'use client'

// ─────────────────────────────────────────────────────────────────────────
// StageTracker (Phase 10.1) — the borrower's loan-lifecycle tracker for the
// workspace header. Presentational only: it renders the board's groups (the
// loan stages) in order, marking completed / current / future. This is the
// loan JOURNEY tracker — distinct from the checklist. No stage logic here;
// current stage = record.group_id, passed in by the caller.
// ─────────────────────────────────────────────────────────────────────────

import { Fragment } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type Stage = { id: string; name: string; position?: number | null }

export function StageTracker({ groups, currentGroupId }: { groups: Stage[]; currentGroupId: string | null }) {
  const stages = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (stages.length < 2) return null
  const currentIdx = stages.findIndex((g) => g.id === currentGroupId)

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
      {stages.map((g, i) => {
        const done = currentIdx >= 0 && i < currentIdx
        const current = i === currentIdx
        return (
          <Fragment key={g.id}>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-2xs font-semibold tabular-nums transition-colors',
                  done
                    ? 'bg-emerald-500/90 text-white'
                    : current
                      ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                      : 'bg-surface-2 text-muted-foreground',
                )}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {current && (
                <span className="whitespace-nowrap text-sm font-bold tracking-tight text-foreground">{g.name}</span>
              )}
            </div>
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className={cn('h-0.5 w-7 flex-shrink-0 rounded-full sm:w-9', i < currentIdx ? 'bg-emerald-500/70' : 'bg-surface-2')}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
