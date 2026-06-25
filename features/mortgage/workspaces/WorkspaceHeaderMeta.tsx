'use client'

import { cn } from '@/lib/utils'
import { resolveWorkspaceTemplate } from '../templates/resolve'
import { computeOpportunitySignals } from '../scoring/opportunities'
import { numberValue, formatCurrency, daysUntil, daysSinceLastTouch, currentGroupName } from '../data'
import type { MortgageData } from '../types'

function Badge({ tone, children }: { tone: 'neutral' | 'accent' | 'amber' | 'red' | 'emerald'; children: React.ReactNode }) {
  const map = {
    neutral: 'bg-surface-2 text-muted-foreground',
    accent: 'bg-jubo-navy/10 text-jubo-navy',
    amber: 'bg-jubo-gold-soft text-jubo-gold',
    red: 'bg-jubo-red/10 text-jubo-red',
    emerald: 'bg-jubo-green-soft text-jubo-green',
  }
  return <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium', map[tone])}>{children}</span>
}

/** High-signal contextual badges shown under the workspace title. */
export function WorkspaceHeaderMeta({ data }: { data: MortgageData }) {
  const template = resolveWorkspaceTemplate(data)
  if (template.key === 'generic') return null

  const signals = computeOpportunitySignals(data, template.key)
  const urgent = signals.filter((s) => s.level === 'urgent').length
  const amount = numberValue(data, 'loan_amount')
  const stage = currentGroupName(data)

  // Next-action status.
  const due = data.record?.next_action_due_at
  const completed = data.record?.next_action_completed_at
  let nextActionBadge: React.ReactNode = null
  if (data.record?.next_action && !completed && due) {
    const d = daysUntil(due)
    if (d != null) {
      nextActionBadge = d < 0
        ? <Badge tone="red">Next action overdue</Badge>
        : <Badge tone="neutral">Next action · {d === 0 ? 'today' : `${d}d`}</Badge>
    }
  }

  const touch = daysSinceLastTouch(data)
  const staleThreshold = template.key === 'partner' ? 30 : template.key === 'loan' ? 21 : 14
  const stale = data.record?.status === 'active' && touch != null && touch >= staleThreshold

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <Badge tone="accent">{template.label}</Badge>
      {amount != null && amount > 0 && <Badge tone="emerald">{formatCurrency(amount)}</Badge>}
      {stage && <Badge tone="neutral">{stage}</Badge>}
      {nextActionBadge}
      {stale && <Badge tone="amber">Stale · {touch}d</Badge>}
      {urgent > 0 && <Badge tone="red">{urgent} need{urgent === 1 ? 's' : ''} attention</Badge>}
    </div>
  )
}
