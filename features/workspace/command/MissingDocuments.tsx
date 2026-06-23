'use client'

// ─────────────────────────────────────────────────────────────────────────
// MissingDocuments (Command Center · Phase 7) — checklist intelligence on the
// Overview. Tells a loan officer what's incomplete WITHOUT opening the Checklist
// tab: completion %, count missing, and the top missing items named as chips.
//
// Derives from already-loaded data (board checklist fields + their values),
// reusing the checklist engine's pure predicates. No new query, no checklist
// storage, no checklist-logic changes. Collapses entirely when the board has no
// checklist fields. Warning color only when incomplete; success when complete.
//
// Label by template: loan → "Missing Documents"; lead/generic → "Missing
// Information"; partner/past_client → "Missing Items" (shown only if a
// checklist exists).
// ─────────────────────────────────────────────────────────────────────────

import { CheckCircle2, FileWarning, ChevronRight } from 'lucide-react'
import { isChecklistFieldType, isChecklistChecked } from '@/features/fields/checklist'
import { resolveTemplateKey } from '@/features/mortgage/templates/resolve'
import type { MortgageData } from '@/features/mortgage/types'

const LABEL: Record<string, string> = {
  loan: 'Missing Documents',
  lead: 'Missing Information',
  partner: 'Missing Items',
  past_client: 'Missing Items',
  generic: 'Missing Information',
}

const TOP_N = 5

export function MissingDocuments({
  data, onOpenChecklist,
}: {
  data: MortgageData
  onOpenChecklist: () => void
}) {
  const checklistFields = data.fields.filter((f: any) => isChecklistFieldType(f.field_type))
  if (checklistFields.length === 0) return null // collapse — no checklist on this board

  const fvByField = new Map<string, any>()
  for (const fv of data.fieldValues) fvByField.set(fv.field_id, fv)

  const items = checklistFields.map((f: any) => ({
    name: f.name as string,
    complete: isChecklistChecked(fvByField.get(f.id)),
  }))
  const total = items.length
  const completed = items.filter((i) => i.complete).length
  const percentage = Math.round((completed / total) * 100)
  const missing = items.filter((i) => !i.complete)
  const isComplete = missing.length === 0

  const label = LABEL[resolveTemplateKey(data)] ?? 'Missing Information'
  const accent = isComplete ? 'var(--accent-green)' : 'var(--accent-amber)'

  return (
    <section className="premium-card relative overflow-hidden rounded-xl p-3.5">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div className="mb-2.5 flex items-center gap-1.5">
        {isComplete
          ? <CheckCircle2 className="h-3.5 w-3.5" style={{ color: accent }} />
          : <FileWarning className="h-3.5 w-3.5" style={{ color: accent }} />}
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className="ml-auto text-2xs font-semibold tabular-nums" style={{ color: accent }}>
          {isComplete ? 'Complete' : `${missing.length} missing`}
        </span>
      </div>

      {/* Progress — warning (amber) while incomplete, success (green) when done. */}
      <div className="mb-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percentage}%`, backgroundColor: accent }} />
        </div>
        <span className="flex-shrink-0 text-2xs tabular-nums text-muted-foreground">{completed}/{total}</span>
      </div>

      {!isComplete && (
        <div className="flex flex-wrap items-center gap-1.5">
          {missing.slice(0, TOP_N).map((m) => (
            <span
              key={m.name}
              className="inline-flex items-center rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-300"
            >
              {m.name}
            </span>
          ))}
          {missing.length > TOP_N && (
            <span className="text-2xs text-muted-foreground">+{missing.length - TOP_N} more</span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onOpenChecklist}
        className="mt-2 inline-flex items-center gap-0.5 rounded text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Open checklist <ChevronRight className="h-3 w-3" />
      </button>
    </section>
  )
}
