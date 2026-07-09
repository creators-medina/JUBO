'use client'

// ─────────────────────────────────────────────────────────────────────────
// Lead Source & Ownership Coverage — report UI (Phase A, Roadmap Step 8).
// Purely presentational over the read-only aggregation; deliberately has
// NO provisioning/setup/edit actions. CSV export is client-side only
// (Blob download of already-loaded data — nothing is written anywhere).
// ─────────────────────────────────────────────────────────────────────────

import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OWNER_LABEL, type SourceClass } from './coverageShared'
import type { CoverageReport } from './leadSourceCoverage'

const CLASS_STYLE: Record<SourceClass, { label: string; cls: string }> = {
  canonical: { label: 'Canonical', cls: 'bg-jubo-green-soft text-jubo-green' },
  alias: { label: 'Alias', cls: 'bg-jubo-gold-soft text-jubo-gold' },
  ambiguous: { label: 'Ambiguous', cls: 'bg-jubo-navy/10 text-jubo-navy' },
  unknown: { label: 'Unknown', cls: 'bg-surface-2 text-muted-foreground' },
  unassigned: { label: 'Unassigned', cls: 'bg-surface-2 text-muted-foreground' },
}

const fmtMoney = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

function csvCell(v: string | number | null | undefined): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-2xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-bold text-foreground">{children}</h2>
      {action}
    </div>
  )
}

const th = 'py-1.5 pr-3 text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground'
const td = 'py-1.5 pr-3 text-sm'

export function LeadSourceCoverageClient({ report }: { report: CoverageReport }) {
  const s = report.summary

  const exportQueue = () => downloadCsv(
    'lead-source-review-queue.csv',
    ['Record', 'Board', 'Stage', 'Raw lead source', 'Classification', 'Resolved category', 'Owner status', 'Amount', 'Reason'],
    report.queue.map((q) => [q.title, q.boardName, q.stage, q.rawSource ?? 'Unassigned', CLASS_STYLE[q.classification].label, q.resolvedCategory, OWNER_LABEL[q.ownerStatus], q.amount, q.reason]),
  )
  const exportValues = () => downloadCsv(
    'lead-source-value-breakdown.csv',
    ['Raw value', 'Classification', 'Canonical category', 'Record count'],
    report.values.map((v) => [v.raw, CLASS_STYLE[v.classification].label, v.canonicalLabel, v.count]),
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Lead Source &amp; Ownership Coverage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Read-only Phase A report (see JUBO_LEAD_SOURCE_BACKFILL_PLAN) — measures attribution and ownership coverage so
          provisioning, alias cleanup, and backfill decisions use real numbers. Nothing on this page writes or changes data.
        </p>
        {s.truncated && (
          <p className="mt-1 text-2xs font-medium text-jubo-gold">
            Large dataset: this report covers the {s.totalRecords.toLocaleString()} most recent active records (sampled, not exhaustive).
          </p>
        )}
      </div>

      {/* ── 1. Coverage summary ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Records scanned" value={s.totalRecords.toLocaleString()} sub={s.truncated ? 'sampled' : 'all active'} />
        <Stat label="Lead source set" value={`${s.sourcePct}%`} sub={`${s.withSource.toLocaleString()} of ${s.totalRecords.toLocaleString()}`} />
        <Stat label="No lead source" value={s.withoutSource.toLocaleString()} />
        <Stat label="Owner resolved" value={`${s.ownerPct}%`} sub={`${s.ownerResolved.toLocaleString()} of ${s.totalRecords.toLocaleString()}`} />
        <Stat label="Owner unresolved" value={s.ownerUnresolved.toLocaleString()} />
        <Stat label="Boards with field" value={`${s.boardsWithField} / ${s.boardsWithField + s.boardsMissingField}`} sub={`${s.boardsMissingField} missing lead_source`} />
      </div>

      {/* ── 2. Board field coverage ── */}
      <section>
        <SectionTitle>Board Field Coverage</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
          <table className="w-full min-w-[640px]">
            <thead><tr>
              <th className={th}>Board</th><th className={th}>Records</th><th className={th}>lead_source field</th>
              <th className={th}>Source set</th><th className={th}>Source %</th><th className={th}>Owner %</th><th className={th}>Note</th>
            </tr></thead>
            <tbody className="divide-y divide-border/60">
              {report.boards.map((b) => (
                <tr key={b.boardId}>
                  <td className={cn(td, 'font-medium text-foreground')}>{b.boardName}</td>
                  <td className={cn(td, 'tabular-nums')}>{b.total}</td>
                  <td className={td}>{b.hasField ? 'Yes' : <span className="text-muted-foreground">No</span>}</td>
                  <td className={cn(td, 'tabular-nums')}>{b.assigned} / {b.total}</td>
                  <td className={cn(td, 'tabular-nums')}>{b.assignedPct}%</td>
                  <td className={cn(td, 'tabular-nums')}>{b.ownerPct}%</td>
                  <td className={cn(td, 'text-2xs text-muted-foreground')}>{b.setupMayBeNeeded ? 'Field setup may be needed (no action from this report)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 3. Lead source value quality ── */}
      <section>
        <SectionTitle action={
          report.values.length > 0 && (
            <button onClick={exportValues} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-1">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export values CSV
            </button>
          )
        }>Lead Source Value Quality</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
          {report.values.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No lead-source values are stored yet.</p>
          ) : (
            <table className="w-full min-w-[520px]">
              <thead><tr>
                <th className={th}>Raw stored value</th><th className={th}>Classification</th><th className={th}>Reports as</th><th className={th}>Records</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {report.values.map((v) => (
                  <tr key={v.raw}>
                    <td className={cn(td, 'font-medium text-foreground')}>{v.raw}</td>
                    <td className={td}><span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', CLASS_STYLE[v.classification].cls)}>{CLASS_STYLE[v.classification].label}</span></td>
                    <td className={cn(td, 'text-muted-foreground')}>{v.canonicalLabel ?? (v.classification === 'ambiguous' ? 'kept as-is (ambiguous)' : v.classification === 'unknown' ? 'kept as-is' : '—')}</td>
                    <td className={cn(td, 'tabular-nums')}>{v.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-2xs text-muted-foreground">
            Classification is display-only: alias values report under their canonical category (raw value preserved); ambiguous values
            (Past Client, Self-Sourced, Purchased Lead, generic Referral) and unknown values are never normalized or hidden.
          </p>
        </div>
      </section>

      {/* ── 4. Ownership coverage ── */}
      <section>
        <SectionTitle>Ownership Coverage</SectionTitle>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-3">
            <table className="w-full">
              <tbody className="divide-y divide-border/60">
                <tr><td className={td}>Owner (<code className="text-2xs">owner_user_id</code>)</td><td className={cn(td, 'text-right tabular-nums')}>{report.ownership.owner}</td></tr>
                <tr><td className={td}>Assigned (<code className="text-2xs">assigned_user_id</code>)</td><td className={cn(td, 'text-right tabular-nums')}>{report.ownership.assigned}</td></tr>
                <tr><td className={td}>Created-by fallback</td><td className={cn(td, 'text-right tabular-nums')}>{report.ownership.createdBy}</td></tr>
                <tr><td className={cn(td, 'font-semibold')}>Unresolved</td><td className={cn(td, 'text-right font-semibold tabular-nums')}>{report.ownership.unresolved}</td></tr>
              </tbody>
            </table>
            <p className="mt-2 text-2xs text-muted-foreground">Fallback resolution is labeled honestly — created-by is not the same as true per-LO ownership.</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">By resolved owner</p>
            {report.ownership.byOwner.length === 0
              ? <p className="text-xs text-muted-foreground">No resolvable owners.</p>
              : report.ownership.byOwner.map((o) => (
                <p key={o.name} className="flex justify-between text-sm"><span>{o.name}</span><span className="tabular-nums">{o.count}</span></p>
              ))}
            {report.ownership.unresolvedByBoard.length > 0 && (
              <>
                <p className="mb-1 mt-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Unresolved by board</p>
                {report.ownership.unresolvedByBoard.map((b) => (
                  <p key={b.boardName} className="flex justify-between text-sm"><span>{b.boardName}</span><span className="tabular-nums">{b.count}</span></p>
                ))}
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── 5. High-value review queue (read-only) ── */}
      <section>
        <SectionTitle action={
          report.queue.length > 0 && (
            <button onClick={exportQueue} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-1">
              <Download className="h-3.5 w-3.5" aria-hidden /> Export queue CSV
            </button>
          )
        }>High-Value Review Queue</SectionTitle>
        <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
          {report.queue.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Nothing needs review — every scanned record has a lead source and a resolvable owner.</p>
          ) : (
            <table className="w-full min-w-[760px]">
              <thead><tr>
                <th className={th}>Record</th><th className={th}>Board</th><th className={th}>Stage</th>
                <th className={th}>Lead source</th><th className={th}>Owner</th><th className={th}>Amount</th><th className={th}>Reason</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {report.queue.map((q) => (
                  <tr key={q.recordId}>
                    <td className={cn(td, 'font-medium text-foreground')}>{q.title}</td>
                    <td className={td}>{q.boardName}</td>
                    <td className={cn(td, 'text-muted-foreground')}>{q.stage ?? '—'}</td>
                    <td className={td}>
                      {q.rawSource
                        ? <>{q.rawSource}{q.resolvedCategory && q.resolvedCategory !== q.rawSource ? <span className="text-2xs text-muted-foreground"> → {q.resolvedCategory}</span> : null}</>
                        : <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold', CLASS_STYLE.unassigned.cls)}>Unassigned</span>}
                    </td>
                    <td className={cn(td, q.ownerStatus === 'unresolved' ? 'font-semibold text-jubo-navy' : 'text-muted-foreground')}>{OWNER_LABEL[q.ownerStatus]}</td>
                    <td className={cn(td, 'tabular-nums')}>{fmtMoney(q.amount)}</td>
                    <td className={cn(td, 'text-2xs text-muted-foreground')}>{q.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-2xs text-muted-foreground">
            Read-only list, prioritized funded/closed → pipeline → pre-approved → initial consult → newest.
            {report.queueLimited && ' Showing the top 100 — export the CSV or fix the top of the list first.'}
            {' '}Editing happens on the records themselves (contact card → Lead Source picker) — this report never writes.
          </p>
        </div>
      </section>
    </div>
  )
}
