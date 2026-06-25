'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, Save } from 'lucide-react'
import { upsertConversionAssumption } from '../actions'
import type { FunnelRow, FunnelStageRow, ConversionAssumptionRow } from '../types'

interface Props {
  funnel: FunnelRow
  stages: FunnelStageRow[]
  assumptions: ConversionAssumptionRow[]
  organizationId: string
}

export function AssumptionsEditor({ funnel, stages, assumptions, organizationId }: Props) {
  // Sequential stage pairs (i → i+1)
  const pairs = stages.slice(0, -1).map((from, i) => ({ from, to: stages[i + 1] }))

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{funnel.name}</h3>
        <span className="text-2xs text-muted-foreground">— set the % that converts from each stage to the next</span>
      </div>

      <div className="divide-y divide-border">
        {pairs.map(({ from, to }) => {
          const existing = assumptions.find(a => a.funnel_stage_id === from.id && a.target_stage_id === to.id)
          return (
            <AssumptionRow
              key={`${from.id}->${to.id}`}
              from={from}
              to={to}
              existing={existing}
              organizationId={organizationId}
            />
          )
        })}
      </div>
    </div>
  )
}

function AssumptionRow({ from, to, existing, organizationId }: {
  from: FunnelStageRow
  to: FunnelStageRow
  existing: ConversionAssumptionRow | undefined
  organizationId: string
}) {
  const router = useRouter()
  const [percent, setPercent] = useState<string>(existing ? String(Math.round(Number(existing.conversion_rate) * 10000) / 100) : '')
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [isPending, startTransition] = useTransition()

  const dirty = (() => {
    const currentPct = existing ? Math.round(Number(existing.conversion_rate) * 10000) / 100 : null
    return String(currentPct ?? '') !== percent || (existing?.notes ?? '') !== notes
  })()

  const handleSave = () => {
    const numPct = parseFloat(percent)
    if (!Number.isFinite(numPct)) return
    const rate = Math.max(0, Math.min(1, numPct / 100))
    startTransition(async () => {
      await upsertConversionAssumption({
        organization_id: organizationId,
        funnel_stage_id: from.id,
        target_stage_id: to.id,
        conversion_rate: rate,
        notes: notes || undefined,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-foreground truncate">{from.name}</span>
        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-foreground truncate">{to.name}</span>
      </div>

      <div className="flex items-center gap-1 w-24">
        <input
          type="number" inputMode="decimal" step="0.1" min={0} max={100}
          value={percent}
          onChange={e => setPercent(e.target.value)}
          placeholder="0"
          className="w-full px-2 py-1 rounded-md bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring tabular-nums text-right"
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>

      <input
        type="text"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Notes (e.g. industry average, seasonal adjustment)"
        className="w-64 px-2 py-1 rounded-md bg-surface-1 border border-border text-xs text-muted-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />

      <button
        onClick={handleSave}
        disabled={!dirty || isPending || percent === ''}
        className={`p-1.5 rounded-md transition-colors ${dirty ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground/50'}`}
        title={dirty ? 'Save' : 'Saved'}
      >
        <Save className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
