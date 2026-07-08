'use client'

// ─────────────────────────────────────────────────────────────────────────
// Plan preview (Phase 4) — a lightweight, live read-out inside the
// onboarding "Plan" step. Reuses the EXACT Phase 3 math (computePlan +
// assumptionsFromAnswers) so onboarding and /production-plan can never
// disagree. Deliberately tiny: three derived numbers + a pointer to the
// full plan page. Defaults (275 bps, 80% split, suggested $500k goal,
// starting mix, Phase 3 conversion assumptions) apply to anything the LO
// hasn't typed yet — labeled as assumptions, never saved on their behalf.
// ─────────────────────────────────────────────────────────────────────────

import { Calculator } from 'lucide-react'
import { computePlan, assumptionsFromAnswers } from '@/features/production-plan/calc'
import { useOnboardingWizard } from '../state/OnboardingWizardProvider'

const fmtMoney = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtNum = (n: number | null): string => (n == null ? '—' : n.toLocaleString('en-US'))

export function PlanPreview() {
  const { answers } = useOnboardingWizard()
  const a = assumptionsFromAnswers(answers as Record<string, unknown>)
  const plan = computePlan(a)

  const items = [
    { label: 'Net comp / loan', value: fmtMoney(plan.netCompPerLoan), hint: `${plan.effectiveNetBps.toLocaleString('en-US', { maximumFractionDigits: 1 })} bps` },
    { label: 'Funded loans needed', value: fmtNum(plan.requiredFundedLoans), hint: 'per year' },
    { label: 'Leads needed', value: fmtNum(plan.annualLeads), hint: 'per year' },
  ]

  return (
    <div className="rounded-xl border border-jubo-navy/20 bg-jubo-navy/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-jubo-navy">
        <Calculator className="h-3.5 w-3.5" aria-hidden />
        Live plan preview
      </p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg bg-card px-3 py-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{it.label}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">{it.value}</p>
            <p className="text-2xs text-muted-foreground">{it.hint}</p>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-2xs text-muted-foreground">
        Uses default assumptions (275 bps gross, 80% split, starting conversion rates) for anything you haven’t
        entered — “—” means an average loan amount is still needed. Fine-tune everything later on the{' '}
        <span className="font-semibold text-foreground">Production Plan</span> page.
      </p>
    </div>
  )
}
