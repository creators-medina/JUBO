'use client'

// ─────────────────────────────────────────────────────────────────────────
// Greatness Tracker — Phase 2 scoreboard UI, rendered below the Daily Call
// Log. Purely presentational: every number arrives precomputed from the
// server (features/prospecting/greatness/queries.ts) for all reporting
// windows, so the timeframe toggle is instant with zero refetching and zero
// client-side scanning (PR #50 lesson).
//
// Data honesty in the UI: each card says HOW its number is derived (per-LO
// vs All records, movement-based vs current-state), untrackable metrics say
// "Not tracked yet" instead of showing a fake number, and missing board /
// stage mappings are reported inline rather than silently dropped.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { PhoneCall, UserPlus, FileSearch, BadgeCheck, Layers, Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GreatnessData, GreatnessWindowKey, MetricScope } from './queries'

const WINDOW_TABS: { key: GreatnessWindowKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
]
const WINDOW_PHRASE: Record<GreatnessWindowKey, string> = {
  today: 'today', week: 'this week', month: 'this month', year: 'this year',
}

function ScopeChip({ scope }: { scope: MetricScope | 'per_lo_exact' | 'coming_soon' | 'current_state' }) {
  const style: Record<string, { label: string; cls: string }> = {
    per_lo_exact: { label: 'Your activity', cls: 'bg-[#B8492C]/10 text-[#96351F]' },
    per_lo: { label: 'Your records', cls: 'bg-[#B8492C]/10 text-[#96351F]' },
    all_records: { label: 'All records', cls: 'bg-surface-2 text-muted-foreground' },
    current_state: { label: 'Current state', cls: 'bg-jubo-gold-soft text-jubo-gold' },
    coming_soon: { label: 'Coming soon', cls: 'bg-surface-2 text-muted-foreground' },
  }
  const s = style[scope]
  return <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', s.cls)}>{s.label}</span>
}

function MetricCard({ icon: Icon, label, value, sub, note, chip }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  note: string
  chip: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5 text-[#B8492C]" aria-hidden />
          {label}
        </span>
        {chip}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      <p className="text-2xs leading-snug text-muted-foreground">{note}</p>
    </div>
  )
}

function LeadSourceBreakdown({ data, win, phrase }: { data: GreatnessData; win: GreatnessWindowKey; phrase: string }) {
  const ls = data.leadSource
  // Windowed entry splits (mirror each card's headline definition)…
  const newLeadCounts = ls.newLeads?.[win] ?? {}
  const paCounts = ls.preApprovals?.[win] ?? {}
  const fundedCounts = ls.funded?.[win] ?? {}
  // …and the pipeline split, which is CURRENT-STATE (not windowed), exactly
  // like the Deals in Pipeline card's headline number.
  const pipeCounts = ls.pipeline ?? {}
  const cols: { label: string; counts: Record<string, number> }[] = [
    { label: 'New Leads', counts: newLeadCounts },
    { label: 'Pre-Approvals', counts: paCounts },
    { label: 'In Pipeline (now)', counts: pipeCounts },
    { label: 'Funded Loans', counts: fundedCounts },
  ]
  // Union of sources seen in any metric; Unassigned always renders last so
  // unattributed records are visible, never hidden.
  const sources = [...new Set(cols.flatMap((c) => Object.keys(c.counts)))]
    .filter((s) => s !== 'Unassigned')
    .sort((a, b) =>
      (fundedCounts[b] ?? 0) - (fundedCounts[a] ?? 0)
      || (pipeCounts[b] ?? 0) - (pipeCounts[a] ?? 0)
      || (newLeadCounts[b] ?? 0) - (newLeadCounts[a] ?? 0),
    )
  const hasUnassigned = cols.some((c) => (c.counts['Unassigned'] ?? 0) > 0)
  const empty = !ls.tracked || ls.assignedCount === 0

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Lead Source Breakdown</h3>
        <span className="text-2xs text-muted-foreground">Leads, pre-approvals &amp; funded {phrase} · pipeline is current · real record attribution only</span>
      </div>
      {empty ? (
        <p className="text-xs text-muted-foreground">
          No lead-source attribution yet. Add a lead source on records to unlock source reporting.
          {!ls.tracked && ' (No board has a lead-source field yet — open a contact card to set one up.)'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-1.5 pr-3">Source</th>
                {cols.map((c) => (
                  <th key={c.label} className="py-1.5 pl-3 text-right">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sources.map((s) => (
                <tr key={s}>
                  <td className="py-1.5 pr-3 font-medium text-foreground">{s}</td>
                  {cols.map((c) => (
                    <td key={c.label} className="py-1.5 pl-3 text-right tabular-nums text-foreground">{c.counts[s] ?? 0}</td>
                  ))}
                </tr>
              ))}
              {hasUnassigned && (
                <tr>
                  <td className="py-1.5 pr-3 font-medium text-muted-foreground">Unassigned</td>
                  {cols.map((c) => (
                    <td key={c.label} className="py-1.5 pl-3 text-right tabular-nums text-muted-foreground">{c.counts['Unassigned'] ?? 0}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-2 text-2xs text-muted-foreground">
            Counts records with a lead source set on the record — nothing is inferred from board names. New Leads, Pre-Approvals, and Funded follow the timeframe above; In Pipeline is the current roster.
          </p>
        </div>
      )}
    </div>
  )
}

export function GreatnessTracker({ data }: { data: GreatnessData }) {
  const [win, setWin] = useState<GreatnessWindowKey>('week')
  const phrase = WINDOW_PHRASE[win]

  const scopeChip = (scope: MetricScope) => <ScopeChip scope={scope} />
  const scopeNote = (scope: MetricScope) =>
    scope === 'per_lo' ? 'Scoped to records you own.' : 'Ownership data is incomplete, so this counts all records.'

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">Greatness Tracker</h2>
          <p className="text-sm text-muted-foreground">
            Track how daily activity turns into leads, pre-approvals, pipeline, and funded loans.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 shadow-sm" role="tablist" aria-label="Reporting window">
          {WINDOW_TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={win === t.key}
              onClick={() => setWin(t.key)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-semibold transition-colors',
                win === t.key ? 'bg-[#B8492C] text-white' : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          icon={PhoneCall}
          label="Calls Made"
          value={data.calls[win].toLocaleString()}
          note="Your logged calls (Log Call + outcome) — same source as the Daily Call Log."
          chip={<ScopeChip scope="per_lo_exact" />}
        />

        {data.newLeads ? (
          <MetricCard
            icon={UserPlus}
            label="New Leads"
            value={data.newLeads.entries[win].toLocaleString()}
            note={`Records moved into Initial Consult ${phrase}${data.newLeads.usedCreatedFallback ? ' (plus records created there)' : ''}. ${scopeNote(data.newLeads.scope)}`}
            chip={scopeChip(data.newLeads.scope)}
          />
        ) : (
          <MetricCard icon={UserPlus} label="New Leads" value="—"
            note="Initial Consult board not found — no leads counted." chip={<ScopeChip scope="all_records" />} />
        )}

        <MetricCard
          icon={FileSearch}
          label="Credit Pulls"
          value="—"
          sub="Not tracked yet"
          note="Credit pulls aren't trackable in Jubo yet — a future credit integration will power this card. No numbers are invented."
          chip={<ScopeChip scope="coming_soon" />}
        />

        {data.preApprovals ? (
          <MetricCard
            icon={BadgeCheck}
            label="Pre-Approvals"
            value={data.preApprovals.entries[win].toLocaleString()}
            sub={`${data.preApprovals.currentCount.toLocaleString()} currently`}
            note={`New pre-approvals ${phrase}: Pre-Approved board${data.preApprovals.stageNames.length > 0 ? ' + pre-approval stages' : ''}, deduped by record. ${scopeNote(data.preApprovals.scope)}`}
            chip={scopeChip(data.preApprovals.scope)}
          />
        ) : (
          <MetricCard icon={BadgeCheck} label="Pre-Approvals" value="—"
            note="No Pre-Approved board or pre-approval-named stage found." chip={<ScopeChip scope="all_records" />} />
        )}

        {data.pipeline ? (
          <MetricCard
            icon={Layers}
            label="Deals in Pipeline"
            value={data.pipeline.currentCount.toLocaleString()}
            sub={`+${data.pipeline.entries[win].toLocaleString()} ${phrase}`}
            note={`Records in Loan In Process right now; +N shows files that entered ${phrase}. ${scopeNote(data.pipeline.scope)}`}
            chip={<ScopeChip scope="current_state" />}
          />
        ) : (
          <MetricCard icon={Layers} label="Deals in Pipeline" value="—"
            note="Loan In Process board not found." chip={<ScopeChip scope="all_records" />} />
        )}

        {data.funded ? (
          <MetricCard
            icon={Landmark}
            label="Funded Loans"
            value={data.funded.entries[win].toLocaleString()}
            note={`Files moved into ${data.funded.stageNames.join(' / ')} on the Closing board ${phrase} (in-app moves only — imported history isn't dated). ${scopeNote(data.funded.scope)}`}
            chip={scopeChip(data.funded.scope)}
          />
        ) : (
          <MetricCard icon={Landmark} label="Funded Loans" value="—"
            note="No funded/closed/post-closing stage detected on the Closing board — stage mapping needed." chip={<ScopeChip scope="all_records" />} />
        )}
      </div>

      {/* ── Phase 5 — Lead Source Breakdown (real attribution only) ── */}
      <LeadSourceBreakdown data={data} win={win} phrase={phrase} />

      {(data.missing.length > 0 || data.movementsTruncated) && (
        <p className="text-2xs text-muted-foreground">
          {data.missing.length > 0 && <>Not found in this workspace: {data.missing.join(', ')}. </>}
          {data.movementsTruncated && <>Movement history hit its scan limit — the year window may undercount older entries.</>}
        </p>
      )}
      <p className="text-2xs text-muted-foreground">
        Lead, pre-approval, pipeline, and funded counts are based on in-app movement history (plus records created directly in a board where noted) — activity from before movement tracking began may not appear.
      </p>
    </section>
  )
}
