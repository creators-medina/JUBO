'use client'

// ─────────────────────────────────────────────────────────────────────────
// Person / File Card V2 (Phase 39A) — Arrive-inspired file workspace.
//
// Overview tab is REAL: it composes the 36D-1 read model (snapshot bindings,
// activities, current-group checklist) with the 36E-1 Communicate context (real
// SMS thread + composer, notes, members) — reusing the shipped pieces, not
// re-shelling them. The three Arrive tabs are structured "coming soon" shells.
// Computed metrics (PI/TI/DTI/LTV) are honest placeholders — never fabricated.
// No new data model, no calculations, no functional Arrive forms.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useTransition } from 'react'
import {
  Loader2, CheckSquare, Square, Plug, ArrowUpRight, ArrowDownLeft,
  MessageSquare, Mail, StickyNote, ListChecks,
} from 'lucide-react'
import { getFileCardData, type PersonCardData, type LoanCommandData } from './actions'
import { deriveLoanMetrics, LoanSummaryStrip, FileSnapshotPanel, SnapshotCard, MetricCell, nameInitials } from './FileSummary'
import type { CommunicateContext } from '@/features/communications/communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { createNote } from '@/features/workspace/notes/actions'
import { createTask } from '@/features/tasks/actions'
import { LoanPropertyTab } from './LoanPropertyTab'
import { BorrowerTab } from './BorrowerTab'
import { FinancialTab } from './FinancialTab'
import { upsertFieldValue, moveRecord } from '@/features/records/actions'
// Phase C3 — harvested LOS Command-Center pieces (reused, not rebuilt).
import { NextActionCard } from '@/features/workspace/components/NextActionCard'
import { ParticipantRibbon } from '@/features/workspace/command/ParticipantRibbon'
import { computeOpportunitySignals } from '@/features/mortgage/scoring/opportunities'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'loan' | 'borrower' | 'financial'
type Filter = 'all' | 'comms' | 'tasks' | 'pipeline'

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'loan', label: 'Loan & Property Info' },
  { key: 'borrower', label: 'Borrower Info' },
  { key: 'financial', label: 'Financial Info' },
]

function activityCategory(t: string): Filter | 'other' {
  if (['call', 'email', 'sms', 'comment', 'note', 'meeting'].includes(t)) return 'comms'
  if (['status_change', 'field_change', 'creation', 'integration_event'].includes(t)) return 'pipeline'
  if (t.includes('task') || t === 'assignment') return 'tasks'
  return 'other'
}

export function PersonFileCard({ recordId }: { recordId: string }) {
  const [card, setCard] = useState<PersonCardData | null | undefined>(undefined)
  const [comms, setComms] = useState<CommunicateContext | undefined>(undefined)
  // Phase C3 — current-board command bundle (loan shape only).
  const [loan, setLoan] = useState<LoanCommandData | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  // Phase C4 — ONE resolver per open. getFileCardData reads each table once and
  // returns the same three shapes the card consumes ({ card, comms, loan }).
  const load = useCallback(() => {
    getFileCardData(recordId)
      .then((d) => {
        if (!d) { setCard(null); setComms(null); setLoan(null); return }
        setCard(d.card); setComms(d.comms); setLoan(d.loan)
      })
      .catch(() => { setCard(null); setComms(null); setLoan(null) })
  }, [recordId])
  useEffect(() => { load() }, [load])

  // Refetch on window focus so harvested mutations (Next Step, Move-To, which
  // call router.refresh()) reflect in this client-loaded card.
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  if (card === undefined) {
    return <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading file…</div>
  }
  if (card === null) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">File unavailable for this record.</div>
  }

  const email = comms?.email ?? null
  const boardId = card.record.boardId

  // Phase C2 — card shape from the existing template resolver (NOT board names).
  // Loan-like boards (loan/lead) get the full loan File Card; every other board
  // (generic/partner/past_client) gets a generic record card: the same universal
  // shell (feed, checklist, notes) without the loan framing and loan-only tabs.
  const isLoanLike = card.templateKey === 'loan' || card.templateKey === 'lead'
  const visibleTabs = isLoanLike ? TABS : TABS.filter((t) => t.key === 'overview')
  const activeTab: Tab = isLoanLike ? tab : 'overview'

  // Phase D5 — resolve every summary metric ONCE from the already-loaded loan
  // bundle (read-only: direct slug reads + display-only LTV/DTI derivations).
  const m = isLoanLike && loan ? deriveLoanMetrics(loan) : null
  const rec = (loan?.record ?? {}) as { title?: string; next_action?: string | null; next_action_completed_at?: string | null }
  const borrowerName = rec.title ?? 'Borrower'
  const nextStep = rec.next_action && !rec.next_action_completed_at ? rec.next_action : null
  const openConditions = card.checklist.hasChecklist ? card.checklist.totalCount - card.checklist.completedCount : 0
  const openTaskCount = (card.tasks as { completed_at: string | null }[]).filter((t) => !t.completed_at).length

  const toggleChecklist = (fieldId: string, complete: boolean) => {
    if (!boardId) return
    setBusy(fieldId)
    upsertFieldValue(fieldId, card.record.id, boardId, { value_boolean: !complete }).then(load).finally(() => setBusy(null))
  }

  return (
    // Pinned shell: the metric strip + tab strip stay fixed; only the tab
    // content below scrolls (the modal itself has a fixed height).
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Reference metric strip — Loan Amount · LTV · FICO · Rate · DSCR ·
          LTC · Est. Closing · Type. Real values or an honest "—". */}
      {m && <div className="flex-shrink-0"><LoanSummaryStrip m={m} /></div>}
      {/* C1-FIX-2 — the borrower identity + comms actions live in the ONE
          WorkspacePanel command header above (avatar · name · role/board/owner ·
          phone, plus call/email/move/expand/close). This card renders only its
          four-tab strip, directly beneath that header + the stage tracker.
          A generic board (one tab) shows no strip — just the single header. */}
      {visibleTabs.length > 1 && (
        <div className="flex flex-shrink-0 gap-1 overflow-x-auto border-b border-border">
          {visibleTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('whitespace-nowrap border-b-2 -mb-px px-3 py-2 text-xs font-medium transition-colors',
                activeTab === t.key ? 'border-jubo-red text-jubo-navy' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Persistent 236px left rail beside every tab (the file command
          center); stacks above the content on narrow screens. On xl the
          wrapper stops scrolling so the Overview can pin its composer —
          columns scroll internally instead; below xl the whole tab scrolls. */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto', m && 'grid grid-cols-1 content-start gap-4 xl:grid-cols-[236px_minmax(0,1fr)] xl:content-stretch xl:overflow-hidden')}>
        {m && (
          <div className="min-h-0 xl:overflow-y-auto">
            <FileSnapshotPanel
              m={m}
              borrowerName={borrowerName}
              phone={comms?.phone ?? null}
              nextStep={nextStep}
              openConditions={openConditions}
              openTasks={openTaskCount}
            />
          </div>
        )}
        <div className={cn('min-w-0 space-y-4', m && activeTab === 'overview' ? 'min-h-0 xl:flex xl:flex-col' : 'min-h-0 xl:overflow-y-auto')}>

      {/* ── LOAN-shape Overview (GHL-style: checklist · conversation · actions).
             On xl the grid fills the tab height; left/right columns scroll
             internally and the Conversation card fills its column, so the
             composer is always visible without scrolling. ── */}
      {activeTab === 'overview' && isLoanLike && (
        <div className="jubo-los-page grid min-h-0 grid-cols-1 gap-4 rounded-xl p-4 lg:grid-cols-3 xl:h-full xl:flex-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.45fr)_minmax(0,0.95fr)]">
          {/* LEFT — Phase Checklist · Financial · Documents. (Key Dates removed;
              closing/lock dates remain in the metric strip, rail, and Loan tab.) */}
          <div className="min-h-0 space-y-4 xl:overflow-y-auto">
            <ConditionsCard checklist={card.checklist} stageName={m?.stage ?? null} busy={busy} onToggle={toggleChecklist} />
            {m && (
              <SnapshotCard title="Financial">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <MetricCell label="Income" value={m.income} />
                  <MetricCell label="Assets" value={m.assets} />
                  <MetricCell label="Liabilities" value={m.liabilities} />
                  <MetricCell label="DTI" value={m.dti} />
                  <MetricCell label="DSCR" value={m.dscr} />
                  <MetricCell label="Total PITI" value={m.totalPiti} />
                </div>
              </SnapshotCard>
            )}
            {/* Documents — no document storage exists in Jubo yet; this is an
                honest empty state, not a fake uploader (gap reported). */}
            <SnapshotCard title="Documents" badge="0">
              <div className="rounded-lg border border-dashed border-jubo-border px-3 py-4 text-center text-2xs text-jubo-muted">
                No documents yet — uploads aren’t available in Jubo yet.
              </div>
            </SnapshotCard>
          </div>

          {/* CENTER (widest) — the Conversation workspace, full column height
              with the composer pinned at the bottom. */}
          <div className="flex min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-card xl:min-h-0">
            <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-sm font-semibold tracking-tight text-jubo-navy">Conversation</p>
              <div className="flex gap-0.5 rounded-lg bg-jubo-card-soft p-0.5">
                {(['all', 'comms', 'pipeline'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={cn('rounded-md px-2.5 py-0.5 text-2xs font-medium capitalize transition-colors',
                      filter === f ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:text-foreground')}>{f}</button>
                ))}
              </div>
            </div>
            <Feed card={card} comms={comms} filter={filter} borrowerName={borrowerName} ownerName={m?.ownerName ?? null} tall />
            <div className="flex-shrink-0 border-t border-border p-2.5">
              <Composer
                recordId={recordId}
                boardId={card.record.boardId}
                orgId={card.record.organizationId}
                comms={comms}
                email={email}
                onChanged={load}
              />
            </div>
          </div>

          {/* RIGHT — Next Step + signals + Tasks + Move-To, then Notes. */}
          <div className="min-h-0 space-y-4 xl:overflow-y-auto">
            {loan && (
              <CommandRail
                recordId={recordId}
                loan={loan}
                templateKey={card.templateKey}
                tasks={card.tasks}
                onChanged={load}
              />
            )}
            <Section title="Notes">
              {comms ? (
                <NoteList organizationId={card.record.organizationId} recordId={recordId} notes={comms.notes} currentUserId={comms.currentUserId} members={comms.members} />
              ) : <div className="flex items-center gap-2 py-2 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>}
            </Section>
          </div>
        </div>
      )}

      {/* ── GENERIC-shape Overview (unchanged) ── */}
      {activeTab === 'overview' && !isLoanLike && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            <Section title="Record summary">
              {card.thisBoard.length > 0 ? (
                card.thisBoard.slice(0, 12).map((f) => <Field key={f.fieldId} label={f.name} value={f.value || null} />)
              ) : (
                <p className="text-2xs text-muted-foreground">No fields on this record yet.</p>
              )}
            </Section>
            <Section title={`Checklist${card.checklist.hasChecklist ? ` · ${card.checklist.completedCount}/${card.checklist.totalCount} (${card.checklist.percentage}%)` : ''}`}>
              {card.checklist.hasChecklist ? (
                <ul className="max-h-60 space-y-1 overflow-y-auto">
                  {card.checklist.items.map((i) => (
                    <li key={i.fieldId}>
                      <button onClick={() => toggleChecklist(i.fieldId, i.complete)} disabled={busy === i.fieldId}
                        className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-surface-1 disabled:opacity-60">
                        {busy === i.fieldId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i.complete ? <CheckSquare className="h-3.5 w-3.5 text-jubo-green" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                        <span className={i.complete ? 'text-foreground' : 'text-muted-foreground'}>{i.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-2xs text-muted-foreground">No checklist for this stage.</p>}
            </Section>
          </div>

          <div className="space-y-3">
            <Section title="Activity & messages" noPad>
              <div className="flex gap-1 border-b border-border px-3 py-2">
                {(['all', 'comms', 'tasks', 'pipeline'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={cn('rounded px-2 py-0.5 text-2xs capitalize', filter === f ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground')}>{f}</button>
                ))}
              </div>
              <Feed card={card} comms={comms} filter={filter} />
              <div className="border-t border-border p-2">
                {!comms ? (
                  <div className="flex items-center gap-2 py-1 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>
                ) : !comms.twilioConnected ? (
                  <a href="/settings/communications" className="flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground"><Plug className="h-3 w-3" /> Connect Twilio to text</a>
                ) : !comms.phone ? (
                  <p className="text-2xs text-muted-foreground">Add a phone number to enable texting.</p>
                ) : (
                  <SMSComposeBox recordId={recordId} participantPhone={comms.phone} onSent={load} compact />
                )}
              </div>
            </Section>
          </div>

          <div className="space-y-4">
            <Section title="Notes">
              {comms ? (
                <NoteList organizationId={card.record.organizationId} recordId={recordId} notes={comms.notes} currentUserId={comms.currentUserId} members={comms.members} />
              ) : <div className="flex items-center gap-2 py-2 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>}
            </Section>
          </div>
        </div>
      )}

      {/* Loan-only tabs — never render on a generic board (also gated out of the
          tab strip above; the activeTab guard makes them unreachable there). */}
      {isLoanLike && activeTab === 'loan' && (
        <LoanPropertyTab recordId={recordId} boardId={card.record.boardId} organizationId={card.record.organizationId} />
      )}
      {isLoanLike && activeTab === 'borrower' && (
        <BorrowerTab recordId={recordId} />
      )}
      {isLoanLike && activeTab === 'financial' && (
        <FinancialTab recordId={recordId} />
      )}
        </div>
      </div>
    </div>
  )
}

function feedTag(activityType: string): string {
  const t = activityType.toLowerCase()
  if (t.includes('call')) return 'CALL'
  if (t.includes('email')) return 'EMAIL'
  if (t.includes('sms') || t.includes('text')) return 'SMS'
  if (t.includes('meeting')) return 'MEETING'
  if (t.includes('note')) return 'NOTE'
  if (t.includes('task')) return 'TASK'
  if (t.includes('status') || t.includes('movement') || t.includes('group')) return 'PIPELINE'
  return 'EVENT'
}

function Feed({
  card, comms, filter, borrowerName, ownerName, tall,
}: {
  card: PersonCardData
  comms: CommunicateContext | undefined
  filter: Filter
  /** Sender identities for the message bubbles (real people, never invented). */
  borrowerName?: string
  ownerName?: string | null
  /** Taller scroll area for the Overview conversation workspace. */
  tall?: boolean
}) {
  type Item = { id: string; kind: 'sms' | 'activity'; ts: string; direction?: string; body?: string | null; label?: string; tag: string; cat: Filter | 'other' }
  const items: Item[] = []
  for (const m of comms?.messages ?? []) items.push({ id: `s-${m.id}`, kind: 'sms', ts: m.occurred_at, direction: m.direction, body: m.body, tag: 'SMS', cat: 'comms' })
  for (const a of card.activities) items.push({ id: `a-${a.id}`, kind: 'activity', ts: a.created_at, label: a.content ?? a.activity_type, tag: feedTag(a.activity_type), cat: activityCategory(a.activity_type) })
  // Reference timeline reads oldest → newest with day separators.
  const shown = items
    .filter((i) => filter === 'all' || i.cat === filter)
    .sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))

  const day = (ts?: string) => (ts ? ts.split('T')[0] : '')
  const fmtDay = (d: string) => {
    const dt = new Date(`${d}T00:00:00`)
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  }
  const fmtTime = (ts?: string) => {
    if (!ts) return ''
    const dt = new Date(ts)
    return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  if (shown.length === 0) return <div className={cn('px-3 py-8 text-center text-2xs text-muted-foreground', tall && 'flex-1')}>Nothing here yet.</div>

  // Precompute day-separator flags (a render-time mutation would violate the
  // immutable-render rule).
  const rows: { item: Item; sep: boolean }[] = []
  {
    let lastDay = ''
    for (const item of shown) {
      const d = day(item.ts)
      rows.push({ item, sep: Boolean(d) && d !== lastDay })
      if (d) lastDay = d
    }
  }
  return (
    <div className={cn('space-y-2 overflow-y-auto p-3', tall ? 'min-h-[16rem] flex-1' : 'max-h-72')}>
      {rows.map(({ item: i, sep }) => {
        const d = day(i.ts)
        return (
          <div key={i.id} className="space-y-2">
            {sep && (
              <div className="flex justify-center pt-1">
                <span className="rounded border border-jubo-border bg-jubo-card-soft px-2 py-0.5 text-[9px] font-semibold tracking-wider text-jubo-muted">
                  {fmtDay(d)}
                </span>
              </div>
            )}
            {i.kind === 'sms' ? (
              <div className={cn('flex items-end gap-2', i.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                {i.direction !== 'outbound' && (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-jubo-red text-[9px] font-bold text-white">
                    {nameInitials(borrowerName)}
                  </span>
                )}
                <div className="max-w-[78%]">
                  <div className={cn('mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground', i.direction === 'outbound' && 'justify-end')}>
                    {i.direction === 'outbound' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}
                    <span className="font-semibold">{i.direction === 'outbound' ? (ownerName ?? 'You') : (borrowerName ?? 'Contact')}</span>
                    <span className="font-semibold tracking-wider text-jubo-muted">{i.tag}</span>
                  </div>
                  <div className={cn(
                    'rounded-xl px-3 py-1.5 text-xs leading-relaxed',
                    i.direction === 'outbound'
                      ? 'border border-jubo-red/15 bg-jubo-red/10 text-jubo-text'
                      : 'border border-jubo-border bg-jubo-card text-jubo-text',
                  )}>
                    {i.body}
                  </div>
                  <div className={cn('mt-0.5 text-[9px] text-muted-foreground', i.direction === 'outbound' && 'text-right')}>{fmtTime(i.ts)}</div>
                </div>
                {i.direction === 'outbound' && (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ background: '#3f83c4' }}>
                    {nameInitials(ownerName ?? 'You')}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-jubo-border bg-jubo-card text-[8px] font-bold tracking-wider text-jubo-muted">
                  {i.tag.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <span className="mr-1.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] font-semibold tracking-wider text-muted-foreground">{i.tag}</span>
                  <span className="text-xs text-foreground/80">{i.label}</span>
                  <span className="ml-1 text-2xs text-muted-foreground">· {fmtTime(i.ts)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Section({ title, children, noPad }: { title: string; children: React.ReactNode; noPad?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      {/* Card section header — larger, stronger hierarchy; navy heading on the
          cream card surface (dark/readable, not cream-on-cream). */}
      <p className="px-3 pt-3 text-sm font-semibold tracking-tight text-jubo-navy">{title}</p>
      <div className={noPad ? '' : 'space-y-2 p-3'}>{children}</div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? 'text-foreground' : 'text-muted-foreground/50'}>{value || '—'}</span>
    </div>
  )
}

function ConditionsCard({
  checklist, stageName, busy, onToggle,
}: {
  checklist: PersonCardData['checklist']
  /** Current stage/phase name — the checklist is already stage-scoped. */
  stageName?: string | null
  busy: string | null
  onToggle: (fieldId: string, complete: boolean) => void
}) {
  return (
    <div className="jubo-los-card p-3.5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold tracking-tight text-jubo-navy">Phase Checklist</p>
          {stageName && <p className="truncate text-2xs text-jubo-muted">{stageName}</p>}
        </div>
        {checklist.hasChecklist && (
          <span className="flex-shrink-0 rounded-full bg-jubo-gold-soft px-2 py-0.5 text-2xs font-semibold tabular-nums text-jubo-gold">
            {checklist.completedCount}/{checklist.totalCount} complete
          </span>
        )}
      </div>
      {/* Progress — uses the already-computed completion percentage. */}
      {checklist.hasChecklist && (
        <div className="mb-2 mt-1.5 h-1 overflow-hidden rounded-full bg-jubo-border/60">
          <div className="h-full rounded-full bg-jubo-green transition-all" style={{ width: `${checklist.percentage}%` }} />
        </div>
      )}
      {checklist.hasChecklist ? (
        <ul className="max-h-64 space-y-0.5 overflow-y-auto">
          {checklist.items.map((i) => (
            <li key={i.fieldId} className="border-b border-jubo-border last:border-0">
              <button onClick={() => onToggle(i.fieldId, i.complete)} disabled={busy === i.fieldId}
                className="flex w-full items-center gap-2.5 py-2 text-left text-xs transition-colors hover:bg-jubo-card-soft disabled:opacity-60">
                {busy === i.fieldId ? <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-jubo-muted" /> : i.complete ? <CheckSquare className="h-4 w-4 flex-shrink-0 text-jubo-green" /> : <Square className="h-4 w-4 flex-shrink-0 text-jubo-border-strong" />}
                <span className={cn('flex-1', i.complete ? 'text-jubo-muted line-through' : 'text-jubo-text')}>{i.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-2xs text-jubo-muted">No checklist for this phase.</p>}
    </div>
  )
}

// 4-mode composer — SMS (real Twilio), Note (real), Task (real), Email (mailto:
// opens the user's mail client; Jubo has no in-app email send, so this is an
// honest open-in-mail action, never a fake "Send").
function Composer({
  recordId, boardId, orgId, comms, email, onChanged,
}: {
  recordId: string
  boardId: string | null
  orgId: string
  comms: CommunicateContext | undefined
  email: string | null
  onChanged: () => void
}) {
  const [mode, setMode] = useState<'sms' | 'email' | 'note' | 'task'>('sms')
  const [text, setText] = useState('')
  const [pending, startTransition] = useTransition()

  const MODES: { key: typeof mode; label: string; Icon: React.ElementType }[] = [
    { key: 'sms', label: 'SMS', Icon: MessageSquare },
    { key: 'email', label: 'Email', Icon: Mail },
    { key: 'note', label: 'Note', Icon: StickyNote },
    { key: 'task', label: 'Task', Icon: ListChecks },
  ]

  const saveNote = () => {
    const content = text.trim()
    if (!content) return
    startTransition(async () => {
      try { await createNote({ organization_id: orgId, record_id: recordId, content }); setText(''); onChanged() } catch {}
    })
  }
  const addTask = () => {
    const title = text.trim()
    if (!title || !boardId) return
    startTransition(async () => {
      try { await createTask({ organization_id: orgId, record_id: recordId, board_id: boardId, title }); setText(''); onChanged() } catch {}
    })
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {MODES.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => setMode(key)}
            className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
              mode === key ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
      </div>

      {mode === 'sms' ? (
        !comms ? (
          <div className="flex items-center gap-2 py-1 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>
        ) : !comms.twilioConnected ? (
          <a href="/settings/communications" className="flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground"><Plug className="h-3 w-3" /> Connect Twilio to text</a>
        ) : !comms.phone ? (
          <p className="text-2xs text-muted-foreground">Add a phone number to enable texting.</p>
        ) : (
          <SMSComposeBox recordId={recordId} participantPhone={comms.phone} onSent={onChanged} compact />
        )
      ) : mode === 'email' ? (
        email ? (
          <div className="space-y-1.5">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={`Write an email to ${email}…`}
              className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Opens your mail app</span>
              <a href={`mailto:${email}${text.trim() ? `?body=${encodeURIComponent(text)}` : ''}`}
                className="rounded-md bg-jubo-red px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-red-dark">Open in mail</a>
            </div>
          </div>
        ) : <p className="text-2xs text-muted-foreground">No email on file for this contact.</p>
      ) : mode === 'note' ? (
        <div className="space-y-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a note…"
            className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
          <div className="flex justify-end">
            <button onClick={saveNote} disabled={!text.trim() || pending}
              className="rounded-md bg-jubo-red px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-red-dark disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New task…"
            onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
            className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
          <div className="flex items-center justify-between">
            {!boardId && <span className="text-[10px] text-muted-foreground">No board — can’t add tasks</span>}
            <button onClick={addTask} disabled={!text.trim() || pending || !boardId}
              className="ml-auto rounded-md bg-jubo-navy px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-navy2 disabled:opacity-50">{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Harvested LOS styling helper ────────────────────────────────────────────
// Warm cream/tan card + muted-gold section label (matches the legacy LOS look).
function LosSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jubo-los-card p-3.5">
      <p className="jubo-los-section-label mb-2">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// ── Harvested LOS right-rail (Phase C3) ─────────────────────────────────────
// Real Next Step (NextActionCard), opportunity signals (computeOpportunitySignals),
// a Tasks summary, the File Team (ParticipantRibbon), and Move-To (moveRecord) —
// all pulled from the parked LosCommandCenter, reading the current-board bundle.
// Narrow shape for the task fields the rail reads (source is any[]).
type RailTask = { id: string; title: string; completed_at: string | null; due_date: string | null }

function CommandRail({
  recordId, loan, templateKey, tasks, onChanged,
}: {
  recordId: string
  loan: LoanCommandData
  templateKey: PersonCardData['templateKey']
  tasks: RailTask[]
  onChanged: () => void
}) {
  const signals = computeOpportunitySignals(loan, templateKey).slice(0, 3)
  const openTasks = tasks.filter((t) => !t.completed_at)
  const upcoming = [...openTasks]
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
    .slice(0, 4)
  const now = new Date()

  return (
    <div className="space-y-4">
      {/* Next Step — dominant navy card (harvested as-is). */}
      <NextActionCard
        recordId={recordId}
        nextAction={loan.record.next_action ?? null}
        nextActionDueAt={loan.record.next_action_due_at ?? null}
        nextActionCompletedAt={loan.record.next_action_completed_at ?? null}
      />

      {/* Opportunity signals — real, computed from existing data. */}
      {signals.length > 0 && (
        <div className="jubo-los-card space-y-1 px-3 py-2.5">
          {signals.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5 text-2xs">
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: s.level === 'urgent' ? 'var(--jubo-red)' : s.level === 'warning' ? 'var(--jubo-gold)' : s.level === 'positive' ? 'var(--jubo-green)' : 'var(--jubo-muted)' }}
                aria-hidden
              />
              <span className="truncate text-jubo-text">{s.label}</span>
              {s.detail && <span className="ml-auto flex-shrink-0 text-jubo-muted">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Tasks — open preview. */}
      <LosSection title={`Tasks${openTasks.length > 0 ? ` · ${openTasks.length}` : ''}`}>
        {upcoming.length === 0 ? (
          <p className="text-2xs italic text-jubo-muted">No open tasks.</p>
        ) : (
          upcoming.map((t) => {
            const overdue = t.due_date && new Date(t.due_date) < now
            return (
              <div key={t.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-xs text-jubo-text">{t.title}</span>
                {t.due_date && (
                  <span className={cn('text-2xs tabular-nums', overdue ? 'text-jubo-red' : 'text-jubo-muted')}>
                    {new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            )
          })
        )}
      </LosSection>

      {/* File team — collapses to null when there's nobody beyond the borrower. */}
      <ParticipantRibbon data={loan} />

      {/* Move to stage — real move (move_record RPC + workflow dispatch). */}
      <MoveToStage
        recordId={recordId}
        boardId={loan.record.board_id}
        groups={loan.groups as MoveGroup[]}
        currentGroupId={loan.record.group_id ?? null}
        onMoved={onChanged}
      />
    </div>
  )
}

// Narrow shape for the group fields the stage picker reads (source is AnyRow[]).
type MoveGroup = { id: string; name: string; position?: number | null }

function MoveToStage({
  recordId, boardId, groups, currentGroupId, onMoved,
}: {
  recordId: string
  boardId: string
  groups: MoveGroup[]
  currentGroupId: string | null
  onMoved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const sorted = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (sorted.length < 2) return null

  const onSelect = (toGroupId: string) => {
    if (!toGroupId || toGroupId === currentGroupId) return
    startTransition(async () => {
      try { await moveRecord(recordId, toGroupId, boardId) } catch {}
      onMoved()
    })
  }

  return (
    <LosSection title="Move to stage">
      <select
        value={currentGroupId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={pending}
        className="w-full rounded-lg border border-jubo-border bg-jubo-card px-2.5 py-1.5 text-xs text-jubo-text transition-colors hover:border-jubo-border-strong focus:outline-none focus:ring-1 focus:ring-jubo-red disabled:opacity-60"
        aria-label="Move to stage"
      >
        {currentGroupId == null && <option value="">Select a stage…</option>}
        {sorted.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      {pending && <p className="mt-1 text-2xs text-jubo-muted">Moving…</p>}
    </LosSection>
  )
}

