'use client'

// ─────────────────────────────────────────────────────────────────────────
// Lead Source & Ownership Coverage — report UI (Phase A, Roadmap Step 8).
// The report sections stay purely presentational over the read-only
// aggregation (CSV export is a client-side Blob of already-loaded data).
//
// 10D addition: ONE explicit admin tool — the per-board lead-source
// option-list refresh (approved batch item C). Refresh rewrites a single
// field's config.options to canonical-15 ∪ existing ∪ stored values, with
// a snapshot kept for the per-field Restore. Record values are never
// touched by either action.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OWNER_LABEL, type SourceClass } from './coverageShared'
import type { CoverageReport } from './leadSourceCoverage'
import { refreshLeadSourceOptions, restoreLeadSourceOptions } from './leadSourceOptionActions'

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
          provisioning, alias cleanup, and backfill decisions use real numbers. The report itself never writes; the one
          admin tool on this page is the per-board option-list refresh below, which never touches record values.
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

      {/* ── 2b. Option lists (10D admin tool — the page's one write action) ── */}
      <OptionListsSection rows={report.optionLists} />

      {/* ── 2c. Ownership by metric population (10E — read-only) ── */}
      <MetricOwnershipSection data={report.metricOwnership} />

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

// ── 10D — per-board option-list refresh (the page's one admin tool) ──────
function OptionListsSection({ rows }: { rows: CoverageReport['optionLists'] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyField, setBusyField] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  if (rows.length === 0) return null

  const run = (fieldId: string, boardName: string, mode: 'refresh' | 'restore') => {
    if (pending) return
    const ok = window.confirm(
      mode === 'refresh'
        ? `Refresh the lead-source options on "${boardName}" to the canonical list?\n\nExisting options and stored record values are kept selectable; record values are never changed. The previous list is saved for Restore.`
        : `Restore the previous lead-source option list on "${boardName}"?`,
    )
    if (!ok) return
    setBusyField(fieldId)
    setMessage(null)
    startTransition(async () => {
      try {
        if (mode === 'refresh') {
          const r = await refreshLeadSourceOptions(fieldId)
          setMessage(`${boardName}: refreshed — ${r.totalOptions} options (${r.canonicalAdded} canonical added, ${r.legacyKept} legacy kept, ${r.storedValuesRescued} stored values kept selectable).`)
        } else {
          const r = await restoreLeadSourceOptions(fieldId)
          setMessage(`${boardName}: previous option list restored (${r.totalOptions} options).`)
        }
        router.refresh()
      } catch (e) {
        setMessage(`${boardName}: ${mode} failed — ${e instanceof Error ? e.message : 'please try again'}`)
      } finally {
        setBusyField(null)
      }
    })
  }

  return (
    <section>
      <SectionTitle>Lead-Source Option Lists</SectionTitle>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <table className="w-full min-w-[640px]">
          <thead><tr>
            <th className={th}>Board</th><th className={th}>Options</th><th className={th}>Missing canonical</th>
            <th className={th}>Legacy kept</th><th className={th}>Last refreshed</th><th className={th}>Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => (
              <tr key={r.fieldId}>
                <td className={cn(td, 'font-medium text-foreground')}>{r.boardName}</td>
                <td className={cn(td, 'tabular-nums')}>{r.optionCount}</td>
                <td className={cn(td, 'tabular-nums')}>
                  {r.missingCanonical > 0
                    ? <span className="font-semibold text-jubo-gold">{r.missingCanonical}</span>
                    : <span className="text-jubo-green">0</span>}
                </td>
                <td className={cn(td, 'tabular-nums')}>{r.legacyOptions}</td>
                <td className={cn(td, 'text-2xs text-muted-foreground')}>
                  {r.refreshedAt ? new Date(r.refreshedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
                <td className={td}>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => run(r.fieldId, r.boardName, 'refresh')}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-medium text-foreground transition-colors hover:bg-surface-1 disabled:opacity-50"
                    >
                      {busyField === r.fieldId ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <RefreshCw className="h-3 w-3" aria-hidden />}
                      Refresh to canonical
                    </button>
                    {r.hasSnapshot && (
                      <button
                        onClick={() => run(r.fieldId, r.boardName, 'restore')}
                        disabled={pending}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-surface-1 hover:text-foreground disabled:opacity-50"
                      >
                        <Undo2 className="h-3 w-3" aria-hidden /> Restore previous
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {message && <p className="mt-2 text-2xs font-medium text-foreground">{message}</p>}
        <p className="mt-2 text-2xs text-muted-foreground">
          Refresh rewrites this board&apos;s picker choices to the canonical 15 — existing options and any values already
          stored on records stay selectable (union), and the previous list is saved for Restore. Record values are never
          changed by either action.
        </p>
      </div>
    </section>
  )
}

// ── 10E — ownership resolution inside each reported metric population ────
function MetricOwnershipSection({ data }: { data: CoverageReport['metricOwnership'] }) {
  const exportAffected = () => downloadCsv(
    'ownership-affected-records.csv',
    ['Population', 'Record', 'Board', 'Stage', 'Ownership resolution'],
    data.affected.map((a) => [a.population, a.title, a.boardName, a.stage, OWNER_LABEL[a.resolution]]),
  )

  return (
    <section>
      <SectionTitle action={
        data.affected.length > 0 && (
          <button onClick={exportAffected} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-1">
            <Download className="h-3.5 w-3.5" aria-hidden /> Export affected CSV
          </button>
        )
      }>Ownership by Metric Population</SectionTitle>
      <div className="overflow-x-auto rounded-xl border border-border bg-card p-3">
        <table className="w-full min-w-[640px]">
          <thead><tr>
            <th className={th}>Population</th><th className={th}>Records</th><th className={th}>Owner</th>
            <th className={th}>Assigned</th><th className={th}>Created-by fallback</th><th className={th}>Unresolved</th>
            <th className={th}>Affected</th>
          </tr></thead>
          <tbody className="divide-y divide-border/60">
            {data.rows.map((r) => (
              <tr key={r.key}>
                <td className={cn(td, 'font-medium text-foreground')}>
                  {r.label}
                  <span className="block text-2xs font-normal text-muted-foreground">{r.note}</span>
                </td>
                <td className={cn(td, 'tabular-nums')}>{r.total}</td>
                <td className={cn(td, 'tabular-nums')}>{r.owner}</td>
                <td className={cn(td, 'tabular-nums')}>{r.assigned}</td>
                <td className={cn(td, 'tabular-nums')}>{r.createdBy}</td>
                <td className={cn(td, 'tabular-nums')}>{r.unresolved}</td>
                <td className={cn(td, 'tabular-nums')}>
                  {r.affected > 0
                    ? <span className="font-semibold text-jubo-gold">{r.affected} ({r.affectedPct}%)</span>
                    : <span className="text-jubo-green">0</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-2xs text-muted-foreground">
          &ldquo;Affected&rdquo; = created-by fallback + unresolved — the records whose ownership actually changes reported
          per-LO numbers (they currently flip Verified Results to &ldquo;All records&rdquo; scope or attribute to whoever
          imported them). Read-only measurement; assigning owners stays a per-record human action.
          {data.affectedLimited && ' The CSV is capped at 500 rows — fix the top and re-run.'}
        </p>
      </div>
    </section>
  )
}
