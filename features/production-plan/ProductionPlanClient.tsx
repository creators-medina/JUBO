'use client'

// ─────────────────────────────────────────────────────────────────────────
// Production Plan — Phase 3 UI. Every input is an editable ASSUMPTION the
// LO owns; every output is live arithmetic from the pure calc module
// (features/production-plan/calc). Saving merges ONLY the production_plan_*
// keys into onboarding_profiles.answers via the existing
// saveOnboardingProgress action (no schema, no new write paths, unrelated
// answers untouched). A failed save never clears the LO's edits.
//
// Plan vs Actual reuses the Greatness Tracker's server aggregation
// (features/prospecting/greatness/queries) so the two surfaces can never
// disagree on what "funded" or "new lead" means.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Calculator, Target, PieChart, Activity, BarChart3, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { saveOnboardingProgress } from '@/features/onboarding/actions'
import type { GreatnessData } from '@/features/prospecting/greatness/queries'
import { LEAD_SOURCES, canonicalSourceKeyForLabel, computePlan, type PlanAssumptions, type LeadSourceKey } from './calc'

const fmtMoney = (n: number | null, digits = 0): string =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: 0 })
const fmtNum = (n: number | null, digits = 0): string =>
  n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits })

function Card({ icon: Icon, title, subtitle, children }: {
  icon: React.ElementType; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-foreground">
          <Icon className="h-4 w-4 text-jubo-gold" aria-hidden />
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, suffix, value, onChange, placeholder, help }: {
  label: string
  suffix?: string
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  help?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={value ?? ''}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') { onChange(null); return }
            const n = Number(raw)
            onChange(Number.isFinite(n) && n >= 0 ? n : null)
          }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-jubo-gold/40"
        />
        {suffix && <span className="flex-shrink-0 text-xs font-medium text-muted-foreground">{suffix}</span>}
      </span>
      {help && <span className="mt-1 block text-2xs text-muted-foreground">{help}</span>}
    </label>
  )
}

function Derived({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-surface-1 px-3 py-2">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ProductionPlanClient({ organizationId, initial, greatness, dailyCallGoal, dailyCallGoalLabel }: {
  organizationId: string
  initial: PlanAssumptions
  greatness: GreatnessData
  dailyCallGoal: number
  dailyCallGoalLabel: string
}) {
  const router = useRouter()
  const toast = useToast()

  const [a, setA] = useState<PlanAssumptions>(initial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<PlanAssumptions>) => { setA((prev) => ({ ...prev, ...p })); setDirty(true) }
  const patchMix = (key: LeadSourceKey, v: number | null) =>
    patch({ mix: { ...a.mix, [key]: v ?? 0 } })
  const patchConv = (key: LeadSourceKey, v: number | null) =>
    patch({ conversionRates: { ...a.conversionRates, [key]: v ?? 0 } })

  const plan = useMemo(() => computePlan(a), [a])

  async function save() {
    setSaving(true)
    try {
      // Only the production_plan_* keys — saveOnboardingProgress merge-upserts,
      // so every other onboarding answer is preserved untouched.
      await saveOnboardingProgress(organizationId, {
        answers: {
          production_plan_annual_net_income_goal: a.annualNetIncomeGoal,
          ...(a.averageLoanAmount != null ? { production_plan_average_loan_amount: a.averageLoanAmount } : {}),
          production_plan_gross_comp_bps: a.grossCompBps,
          production_plan_lo_split_percent: a.loSplitPercent,
          production_plan_net_comp_bps_override: a.netCompBpsOverride,
          production_plan_lead_source_mix: a.mix,
          production_plan_conversion_rates: a.conversionRates,
        },
      })
      setDirty(false)
      toast.success('Production plan saved')
      router.refresh()
    } catch {
      // Keep the LO's edits — never clear values on a failed save.
      toast.error('Could not save the plan — your edits are still here. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const mixWarning = Math.round(plan.mixTotalPercent * 100) / 100 !== 100
  const weeklyCallsAtGoal = dailyCallGoal * 5

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Calculator className="h-6 w-6 text-jubo-gold" aria-hidden />
            Production Plan
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Reverse-engineer the activity needed to hit your annual income goal.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || !dirty}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-semibold transition-colors',
            dirty && !saving
              ? 'bg-jubo-navy text-white hover:bg-jubo-navy-2'
              : 'cursor-default bg-surface-2 text-muted-foreground',
          )}>
          {saving ? 'Saving…' : dirty ? 'Save plan' : 'Saved'}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── 1. Income Goal ── */}
        <Card icon={Target} title="Income Goal" subtitle="Your annual NET LO comp goal — what you take home, not company revenue.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Annual net LO comp goal" suffix="$/yr"
              value={a.annualNetIncomeGoal} onChange={(v) => patch({ annualNetIncomeGoal: v ?? 0 })} />
            <Field label="Average loan amount" suffix="$"
              value={a.averageLoanAmount} onChange={(v) => patch({ averageLoanAmount: v })}
              placeholder="e.g. 400,000" help="Your market's average — required before loan math can run." />
            <Field label="Gross comp" suffix="bps"
              value={a.grossCompBps} onChange={(v) => patch({ grossCompBps: v ?? 0 })} />
            <Field label="LO net split" suffix="%"
              value={a.loSplitPercent} onChange={(v) => patch({ loSplitPercent: v ?? 0 })} />
            <Field label="Net comp override (optional)" suffix="bps"
              value={a.netCompBpsOverride} onChange={(v) => patch({ netCompBpsOverride: v })}
              placeholder={`derived: ${fmtNum(plan.derivedNetBps, 1)}`}
              help={plan.usingOverride
                ? `Manual override in use — derived would be ${fmtNum(plan.derivedNetBps, 1)} bps (gross × split).`
                : `Leave blank to use gross × split = ${fmtNum(plan.derivedNetBps, 1)} bps.`} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Derived label="Gross / loan" value={fmtMoney(plan.grossRevenuePerLoan)} hint={`${fmtNum(a.grossCompBps)} bps`} />
            <Derived label="Net comp / loan" value={fmtMoney(plan.netCompPerLoan)}
              hint={`${fmtNum(plan.effectiveNetBps, 1)} bps${plan.usingOverride ? ' (override)' : ''}`} />
            <Derived label="Required funded loans" value={fmtNum(plan.requiredFundedLoans)}
              hint={plan.requiredFundedExact != null ? `${fmtNum(plan.requiredFundedExact, 1)} exact, rounded up` : 'enter loan amount'} />
          </div>
        </Card>

        {/* ── 3. Activity Plan ── */}
        <Card icon={Activity} title="Activity Plan" subtitle="What the goal requires across the year, month, and week.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Derived label="Annual leads" value={fmtNum(plan.annualLeads)} />
            <Derived label="Monthly leads" value={fmtNum(plan.monthlyLeads)} />
            <Derived label="Weekly leads" value={fmtNum(plan.weeklyLeads)} />
            <Derived label="Funded loans" value={fmtNum(plan.requiredFundedLoans)} />
          </div>
          <div className="mt-4 rounded-lg border border-border bg-surface-1 p-3 text-xs text-muted-foreground">
            <p>
              <span className="font-semibold text-foreground">Daily calls:</span> your current goal is{' '}
              <span className="font-bold tabular-nums text-foreground">{dailyCallGoal} calls/day</span>{' '}
              ({dailyCallGoalLabel}) ≈ {weeklyCallsAtGoal} calls/week alongside the{' '}
              {plan.weeklyLeads != null ? `~${fmtNum(plan.weeklyLeads)} leads/week` : 'weekly leads'} this plan requires.
            </p>
            <p className="mt-1.5">
              No call-to-lead conversion is assumed in v1 — the daily call goal stays yours to set, editable on the{' '}
              <Link href="/prospecting" className="font-semibold text-jubo-navy underline-offset-2 hover:underline">
                Daily Call Log
              </Link>.
            </p>
          </div>
        </Card>
      </div>

      {/* ── 2. Lead Source Mix ── */}
      <Card icon={PieChart} title="Lead Source Mix" subtitle="Target mix and conversion assumptions — planning inputs you control, not measured production. Lead-source tracking on records arrives in a later phase.">
        {mixWarning && (
          <p className="mb-3 flex items-center gap-2 rounded-lg bg-jubo-gold-soft px-3 py-2 text-xs font-medium text-jubo-gold">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden />
            Your mix totals {fmtNum(plan.mixTotalPercent, 1)}% — set it to 100% so per-source loans add up to your funded target. Calculations below use your raw percentages.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Target mix %</th>
                <th className="py-2 pr-3">Conversion %</th>
                <th className="py-2 pr-3 text-right">Funded loans</th>
                <th className="py-2 text-right">Leads needed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {plan.perSource.map((row) => (
                <tr key={row.key}>
                  <td className="py-1.5 pr-3 font-medium text-foreground">{row.label}</td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number" inputMode="decimal" min={0} max={100}
                      value={a.mix[row.key] === 0 ? '' : a.mix[row.key]}
                      placeholder="0"
                      onChange={(e) => patchMix(row.key, e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-jubo-gold/40"
                    />
                  </td>
                  <td className="py-1.5 pr-3">
                    <input
                      type="number" inputMode="decimal" min={0} max={100}
                      value={a.conversionRates[row.key] === 0 ? '' : a.conversionRates[row.key]}
                      placeholder="0"
                      onChange={(e) => patchConv(row.key, e.target.value === '' ? 0 : Number(e.target.value))}
                      className="w-16 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-jubo-gold/40"
                    />
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-foreground">{fmtNum(row.fundedLoans, 1)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-foreground">{fmtNum(row.leadsNeeded, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-sm font-bold text-foreground">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 pr-3 tabular-nums">{fmtNum(plan.mixTotalPercent, 1)}%</td>
                <td className="py-2 pr-3" />
                <td className="py-2 pr-3 text-right tabular-nums">{fmtNum(plan.requiredFundedExact, 1)}</td>
                <td className="py-2 text-right tabular-nums">{fmtNum(plan.annualLeads)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-2xs text-muted-foreground">
          Conversion rates are starting assumptions — edit them to match your real experience. A source with 0% conversion shows “—” (no leads math is invented for it).
        </p>
      </Card>

      {/* ── 4. Plan vs Actual (Greatness Tracker definitions) ── */}
      <Card icon={BarChart3} title="Plan vs Actual — Year to Date"
        subtitle="Actuals use the exact Greatness Tracker definitions (calls from your logs; leads, pre-approvals, pipeline, and funded from board movement history).">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Derived label="Calls made" value={fmtNum(greatness.calls.year)} hint="your logged calls" />
          <Derived label="New leads" value={greatness.newLeads ? fmtNum(greatness.newLeads.entries.year) : '—'}
            hint={plan.annualLeads != null ? `plan: ${fmtNum(plan.annualLeads)}/yr` : undefined} />
          <Derived label="Pre-approvals" value={greatness.preApprovals ? fmtNum(greatness.preApprovals.entries.year) : '—'} />
          <Derived label="In pipeline now" value={greatness.pipeline ? fmtNum(greatness.pipeline.currentCount) : '—'} hint="current state" />
          <Derived label="Funded loans" value={greatness.funded ? fmtNum(greatness.funded.entries.year) : '—'}
            hint={plan.requiredFundedLoans != null ? `plan: ${fmtNum(plan.requiredFundedLoans)}/yr` : undefined} />
        </div>
        <p className="mt-2 text-2xs text-muted-foreground">
          Movement-based actuals only count in-app moves since movement tracking began — earlier history may not appear.
        </p>

        {/* ── Phase 5 — planned vs actual source mix (real attribution only) ── */}
        <SourceMixComparison mix={a.mix} greatness={greatness} />
      </Card>
    </div>
  )
}

type MixMetricKey = 'newLeads' | 'preApprovals' | 'pipeline' | 'funded'

function SourceMixComparison({ mix, greatness }: { mix: Record<LeadSourceKey, number>; greatness: GreatnessData }) {
  const ls = greatness.leadSource
  // Phase 5.2 — actual mix viewable per metric. Each option reuses the exact
  // Greatness Tracker attribution: YTD entries for leads/pre-approvals/funded,
  // the current roster for pipeline (definitions are never forked here).
  const metrics: { key: MixMetricKey; label: string; scope: string; counts: Record<string, number> | null }[] = [
    { key: 'newLeads', label: 'New Leads', scope: 'New Leads YTD', counts: ls.newLeads?.year ?? null },
    { key: 'preApprovals', label: 'Pre-Approvals', scope: 'Pre-Approvals YTD', counts: ls.preApprovals?.year ?? null },
    { key: 'pipeline', label: 'Pipeline', scope: 'current pipeline', counts: ls.pipeline },
    { key: 'funded', label: 'Funded', scope: 'Funded Loans YTD', counts: ls.funded?.year ?? null },
  ]
  const [metric, setMetric] = useState<MixMetricKey>('newLeads')
  const active = metrics.find((m) => m.key === metric)!
  const yearCounts = active.counts ?? {}

  // Fold raw stored labels into canonical sources; legacy/imported values we
  // don't recognize aggregate into an explicit "unrecognized" row (never
  // silently coerced), and Unassigned stays outside the percentage mix.
  const actualByKey = new Map<LeadSourceKey, number>()
  let unrecognized = 0
  let unassigned = 0
  for (const [label, count] of Object.entries(yearCounts)) {
    if (label === 'Unassigned') { unassigned += count; continue }
    const key = canonicalSourceKeyForLabel(label)
    if (key) actualByKey.set(key, (actualByKey.get(key) ?? 0) + count)
    else unrecognized += count
  }
  const assignedTotal = [...actualByKey.values()].reduce((s, n) => s + n, 0) + unrecognized

  const metricPicker = (
    <div className="flex items-center gap-1" role="tablist" aria-label="Actual-mix metric">
      {metrics.map((m) => (
        <button
          key={m.key}
          role="tab"
          aria-selected={metric === m.key}
          onClick={() => setMetric(m.key)}
          className={cn(
            'rounded-md px-2 py-0.5 text-2xs font-semibold transition-colors',
            metric === m.key ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
          )}>
          {m.label}
        </button>
      ))}
    </div>
  )

  if (assignedTotal === 0) {
    return (
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-foreground">Planned vs actual source mix</p>
          {metricPicker}
        </div>
        <p className="mt-1 text-2xs text-muted-foreground">
          No lead-source attribution for {active.scope} yet. Add a lead source on records to unlock source reporting — your planned mix above stays the target.
        </p>
      </div>
    )
  }

  const rows = LEAD_SOURCES
    .map((s) => ({ label: s.label, planned: mix[s.key] ?? 0, actualCount: actualByKey.get(s.key) ?? 0 }))
    .filter((r) => r.planned > 0 || r.actualCount > 0)
  const pctOf = (n: number) => Math.round((n / assignedTotal) * 1000) / 10

  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-foreground">Planned vs actual source mix — {active.scope}</p>
        {metricPicker}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 pr-3">Source</th>
              <th className="py-1.5 pr-3 text-right">Planned %</th>
              <th className="py-1.5 pr-3 text-right">Actual %</th>
              <th className="py-1.5 text-right">Actual count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-1.5 pr-3 font-medium text-foreground">{r.label}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{r.planned}%</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-foreground">{pctOf(r.actualCount)}%</td>
                <td className="py-1.5 text-right tabular-nums text-foreground">{r.actualCount}</td>
              </tr>
            ))}
            {unrecognized > 0 && (
              <tr>
                <td className="py-1.5 pr-3 font-medium text-muted-foreground">Other / unrecognized values</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">—</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{pctOf(unrecognized)}%</td>
                <td className="py-1.5 text-right tabular-nums text-muted-foreground">{unrecognized}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-2xs text-muted-foreground">
        Actual source mix only includes records with a lead source assigned
        {unassigned > 0 ? ` — ${unassigned.toLocaleString()} record${unassigned === 1 ? '' : 's'} in ${active.scope} ${unassigned === 1 ? 'is' : 'are'} unassigned and excluded from the percentages` : ''}.
      </p>
    </div>
  )
}
