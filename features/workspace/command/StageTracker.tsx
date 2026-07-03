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

// Display-only label mapping for the Client Journey. Collapses the stored board
// group name to its journey PHASE for display — Lead / Loan / Funded — without
// touching stored names, IDs, ordering, or movement. Unknown groups (e.g.
// partner / past-client boards) fall back to their original name.
export function displayJourneyStageName(name: string): string {
  const n = name.trim().toLowerCase()
  if (n.includes('funded') || n.includes('closed')) return 'Funded'
  if (n.includes('processing') || n.includes('in process') || n.includes('submitted') ||
      n.includes('condition') || n.includes('clear to close') || n.includes('ctc') ||
      n.includes('underwrit')) return 'Loan'
  if (n.includes('inquiry') || n.includes('lead') || n.includes('credit') ||
      n.includes('preapprov') || n.includes('pre-approv') || n.includes('shopping') ||
      n.includes('prequal') || n.includes('under contract')) return 'Lead'
  return name
}

export function StageTracker({ groups, currentGroupId }: { groups: Stage[]; currentGroupId: string | null }) {
  const stages = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (stages.length < 2) return null
  const currentIdx = stages.findIndex((g) => g.id === currentGroupId)

  return (
    // Reference stepper: compact numbered rounded squares — current step coral
    // with its stage name beside it, completed steps green, future steps muted
    // navy — joined by thin connector lines that stretch across the row.
    <div className="flex w-full max-w-3xl items-center gap-2 overflow-x-auto py-0.5">
      {stages.map((g, i) => {
        const done = currentIdx >= 0 && i < currentIdx
        const current = i === currentIdx
        return (
          <Fragment key={g.id}>
            <div className="flex flex-shrink-0 items-center gap-2">
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-md text-2xs font-semibold tabular-nums transition-colors',
                  done
                    ? 'bg-jubo-green/80 text-white'
                    : current
                      ? 'bg-jubo-red text-white'
                      : 'bg-jubo-navy2 text-white/50',
                )}
                title={g.name}
                aria-current={current ? 'step' : undefined}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {current && (
                <span className="whitespace-nowrap text-sm font-bold tracking-tight text-white">{displayJourneyStageName(g.name)}</span>
              )}
            </div>
            {i < stages.length - 1 && (
              <span
                aria-hidden
                className={cn('h-px min-w-6 flex-1 flex-shrink rounded-full', i < currentIdx ? 'bg-jubo-green/50' : 'bg-white/15')}
              />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}
