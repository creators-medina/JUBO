'use client'

// ─────────────────────────────────────────────────────────────────────────
// Manual vs Verified — Greatness Tracker rework Phase 2.
//
// Connects the MANUAL weekly tracker (self-reported, localStorage) to the
// CRM-verified metrics VISUALLY — the underlying data is never merged and
// manual entries still write to nothing in the CRM. Manual totals come
// live from the shared manualTracker store (the exact math/keys the grid
// uses); verified numbers come from the same GreatnessData object that
// powers the Verified Results cards (definitions are never forked, and no
// extra querying happens).
//
// Honesty rules: Credit is "Not tracked yet" (no credit integration);
// Events/Videos/Thank Yous/Face to Face are "Manual only" (no safe CRM
// model clearly tracks them — call logs and record movements don't);
// Deals compares against the CURRENT pipeline roster and is labeled
// "current state" because that is how the base metric is defined.
// "Needs review" is not an error — it just means the two don't line up.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LOCAL_KEYS } from '@/lib/localKeys'
import type { GreatnessData } from './queries'
import { ACTIVITIES, useManualWeekTotals } from './manualTracker'

type RowStatus = 'matched' | 'ahead' | 'needs_review' | 'manual_only' | 'not_tracked'

const STATUS_STYLE: Record<RowStatus, { label: string; cls: string }> = {
  matched: { label: 'Matched', cls: 'bg-jubo-green-soft text-jubo-green' },
  ahead: { label: 'Ahead', cls: 'bg-jubo-gold-soft text-jubo-gold' },
  // Neutral on purpose (operator audit): this is a reconciliation state,
  // not an error — red/rust made LOs read it as "something is broken".
  needs_review: { label: 'Check CRM', cls: 'bg-jubo-navy/10 text-jubo-navy' },
  manual_only: { label: 'Manual only', cls: 'bg-surface-2 text-muted-foreground' },
  not_tracked: { label: 'Not tracked yet', cls: 'bg-surface-2 text-muted-foreground' },
}

type CompareRow = {
  key: string
  label: string
  manual: number
  /** null → the CRM can't verify this activity. */
  verified: number | null
  /** Why it can't be verified (drives the status chip). */
  untracked?: 'manual_only' | 'not_tracked'
  /** The verified number is a current-state roster, not a weekly count. */
  currentState?: boolean
}

const COLLAPSE_KEY = LOCAL_KEYS.manualVsVerifiedCollapsed

export function ManualVsVerified({ data, userId }: { data: GreatnessData; userId?: string }) {
  const manual = useManualWeekTotals(userId)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch { /* default expanded */ }
  }, [])
  const toggle = () => {
    setCollapsed((c) => {
      try { window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1') } catch { /* view-only */ }
      return !c
    })
  }

  // Verified values reuse the SAME GreatnessData the cards render — week
  // window to match the manual tracker's week, except Deals (current-state
  // by definition). A missing board mapping → honest "Not tracked yet".
  const verifiedFor = (key: string): Pick<CompareRow, 'verified' | 'untracked' | 'currentState'> => {
    switch (key) {
      case 'leads': return data.newLeads ? { verified: data.newLeads.entries.week } : { verified: null, untracked: 'not_tracked' }
      case 'preapp': return data.preApprovals ? { verified: data.preApprovals.entries.week } : { verified: null, untracked: 'not_tracked' }
      case 'deals': return data.pipeline ? { verified: data.pipeline.currentCount, currentState: true } : { verified: null, untracked: 'not_tracked' }
      case 'fundings': return data.funded ? { verified: data.funded.entries.week } : { verified: null, untracked: 'not_tracked' }
      case 'credit': return { verified: null, untracked: 'not_tracked' }
      default: return { verified: null, untracked: 'manual_only' } // events / videos / thank yous / face to face
    }
  }

  const rows: CompareRow[] = ACTIVITIES.map((a) => ({
    key: a.key, label: a.label, manual: manual[a.key] ?? 0, ...verifiedFor(a.key),
  }))

  const statusOf = (r: CompareRow): RowStatus => {
    if (r.verified == null) return r.untracked === 'manual_only' ? 'manual_only' : 'not_tracked'
    const diff = r.verified - r.manual
    if (diff === 0) return 'matched'
    return diff > 0 ? 'ahead' : 'needs_review'
  }
  const diffLabel = (r: CompareRow): string => {
    if (r.verified == null) return '—'
    const diff = r.verified - r.manual
    return diff > 0 ? `+${diff}` : String(diff)
  }

  const firstReview = rows.find((r) => statusOf(r) === 'needs_review')

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={toggle} aria-expanded={!collapsed} className="flex min-w-0 items-center gap-2 text-left">
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />}
          <span className="text-sm font-bold text-foreground">Manual vs Verified</span>
          <span className="hidden truncate text-2xs text-muted-foreground sm:inline">
            Compare what was logged in the weekly tracker with what the CRM can verify.
          </span>
        </button>
        <span className="flex-shrink-0 text-2xs text-muted-foreground">This week</span>
      </div>

      {!collapsed && (
        <>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 pr-3">Activity</th>
                  <th className="px-2 py-1.5 text-right">Manual Logged</th>
                  <th className="px-2 py-1.5 text-right">CRM Verified</th>
                  <th className="px-2 py-1.5 text-right">Difference</th>
                  <th className="py-1.5 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {rows.map((r) => {
                  const status = statusOf(r)
                  const s = STATUS_STYLE[status]
                  return (
                    <tr key={r.key}>
                      <td className="py-1.5 pr-3 font-medium text-foreground">{r.label}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{r.manual}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-foreground">
                        {r.verified == null ? <span className="text-muted-foreground">—</span> : r.verified}
                        {r.currentState && <span className="ml-1 text-2xs text-muted-foreground">(current state)</span>}
                      </td>
                      <td className={cn('px-2 py-1.5 text-right tabular-nums',
                        r.verified == null ? 'text-muted-foreground' : 'font-semibold text-foreground')}>
                        {diffLabel(r)}
                      </td>
                      <td className="py-1.5 pl-3 text-right">
                        <span className={cn('inline-block rounded-full px-2 py-0.5 text-2xs font-semibold', s.cls)}>{s.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-2xs leading-snug text-muted-foreground">
            {firstReview
              ? <>You logged {firstReview.manual} {firstReview.label}{firstReview.manual === 1 ? '' : firstReview.label.endsWith('s') ? '' : 's'} this week, but the CRM verified {firstReview.verified}. Check whether records need to be updated or whether the manual log was simply ahead of the CRM — “Check CRM” means the manual log and CRM records don’t fully line up yet, not that something is wrong. </>
              : <>“Check CRM” means the manual log and CRM records don’t fully line up yet — not that something is wrong. </>}
            Deals compares against the current Loan In Process roster (current state, not a weekly count). Manual-only rows have no CRM source yet and are never invented.
          </p>
        </>
      )}
    </div>
  )
}
