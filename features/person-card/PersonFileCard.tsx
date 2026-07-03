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
import { deriveLoanMetrics, LoanSummaryStrip, FileSnapshotPanel, SnapshotCard, SnapRow } from './FileSummary'
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
    <div className="space-y-3">
      {/* ARIVE-style top summary strip — Loan Amount · LTV · FICO · Rate ·
          DSCR · LTC · Est. Closing · Type. Real values or an honest "—". */}
      {m && <LoanSummaryStrip m={m} />}
      {/* C1-FIX-2 — the borrower identity + comms actions live in the ONE
          WorkspacePanel command header above (avatar · name · role/board/owner ·
          phone, plus call/email/move/expand/close). This card renders only its
          four-tab strip, directly beneath that header + the stage tracker.
          A generic board (one tab) shows no strip — just the single header. */}
      {visibleTabs.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-border">
          {visibleTabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn('whitespace-nowrap border-b-2 -mb-px px-3 py-2 text-xs font-medium transition-colors',
                activeTab === t.key ? 'border-jubo-navy text-jubo-navy' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Phase D5 — persistent left file-snapshot rail beside every tab (the
          "file command center"); stacks above the content on narrow screens. */}
      <div className={m ? 'grid grid-cols-1 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]' : undefined}>
        {m && (
          <FileSnapshotPanel
            m={m}
            borrowerName={borrowerName}
            phone={comms?.phone ?? null}
            email={email}
            nextStep={nextStep}
            openConditions={openConditions}
            openTasks={openTaskCount}
          />
        )}
        <div className="min-w-0 space-y-4">

      {/* ── LOAN-shape Overview (snapshot grid + feed + command rail) ── */}
      {activeTab === 'overview' && isLoanLike && (
        <div className="jubo-los-page grid grid-cols-1 gap-4 rounded-xl p-4 lg:grid-cols-3">
          {/* LEFT — snapshot cards: loan, borrower, property, financial, conditions. */}
          <div className="space-y-4">
            {m && (
              <SnapshotCard title="Loan Snapshot">
                <SnapRow label="Loan amount" value={m.loanAmount} />
                <SnapRow label="LTV" value={m.ltv} />
                <SnapRow label="Rate" value={m.rate} />
                <SnapRow label="Loan type" value={m.loanType} />
                <SnapRow label="Purpose" value={m.purpose} />
                <SnapRow label="Est. closing" value={m.closing} />
              </SnapshotCard>
            )}
            {m && (
              <SnapshotCard title="Borrower">
                <SnapRow label="Name" value={borrowerName} />
                <SnapRow label="Phone" value={comms?.phone ?? null} />
                <SnapRow label="Email" value={email} />
                <SnapRow label="FICO" value={m.fico} />
              </SnapshotCard>
            )}
            {m && (
              <SnapshotCard title="Property">
                <SnapRow label="Address" value={m.address} />
                <SnapRow label="City / State" value={m.cityState} />
                <SnapRow label="Value" value={m.propertyValue ?? m.appraisedValue} />
                <SnapRow label="Type" value={[m.propertyType, m.occupancy].filter(Boolean).join(' · ') || null} />
              </SnapshotCard>
            )}
            {m && (
              <SnapshotCard title="Financial">
                <SnapRow label="Monthly income" value={m.income} />
                <SnapRow label="Assets" value={m.assets} />
                <SnapRow label="Liabilities" value={m.liabilities} />
                <SnapRow label="DTI" value={m.dti} />
                <SnapRow label="DSCR" value={m.dscr} />
                <SnapRow label="LTC" value={m.ltc} />
                <SnapRow label="Total PITI" value={m.totalPiti} />
              </SnapshotCard>
            )}
            <ConditionsCard checklist={card.checklist} busy={busy} onToggle={toggleChecklist} />
          </div>

          {/* CENTER — conversation feed + 4-mode composer. */}
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex gap-1 border-b border-border px-3 py-2">
                {(['all', 'comms', 'tasks', 'pipeline'] as Filter[]).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={cn('rounded-full px-2.5 py-0.5 text-2xs font-medium capitalize transition-colors',
                      filter === f ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:text-foreground')}>{f}</button>
                ))}
              </div>
              <Feed card={card} comms={comms} filter={filter} />
              <div className="border-t border-border p-2.5">
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
          </div>

          {/* RIGHT — Next Step + signals + Tasks + Related + Move-To, then Notes. */}
          <div className="space-y-4">
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

function Feed({ card, comms, filter }: { card: PersonCardData; comms: CommunicateContext | undefined; filter: Filter }) {
  type Item = { id: string; kind: 'sms' | 'activity'; ts: string; direction?: string; body?: string | null; label?: string; tag: string; cat: Filter | 'other' }
  const items: Item[] = []
  for (const m of comms?.messages ?? []) items.push({ id: `s-${m.id}`, kind: 'sms', ts: m.occurred_at, direction: m.direction, body: m.body, tag: 'SMS', cat: 'comms' })
  for (const a of card.activities) items.push({ id: `a-${a.id}`, kind: 'activity', ts: a.created_at, label: a.content ?? a.activity_type, tag: feedTag(a.activity_type), cat: activityCategory(a.activity_type) })
  const shown = items
    .filter((i) => filter === 'all' || i.cat === filter)
    .sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))

  const fmtTs = (ts?: string) => (ts ? ts.split('T')[0] : '')

  if (shown.length === 0) return <div className="px-3 py-8 text-center text-2xs text-muted-foreground">Nothing here yet.</div>
  return (
    <div className="max-h-72 space-y-2 overflow-y-auto p-3">
      {shown.map((i) => i.kind === 'sms' ? (
        <div key={i.id} className={cn('flex', i.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
          <div className="max-w-[82%]">
            <div className={cn('mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground', i.direction === 'outbound' && 'justify-end')}>
              {i.direction === 'outbound' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}
              <span className="font-semibold tracking-wider">{i.tag}</span> · {fmtTs(i.ts)}
            </div>
            <div className={cn('rounded-2xl px-3 py-1.5 text-xs', i.direction === 'outbound' ? 'bg-jubo-navy text-white' : 'bg-surface-2 text-foreground')}>
              {i.body}
            </div>
          </div>
        </div>
      ) : (
        <div key={i.id} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-jubo-border-strong" />
          <div className="min-w-0 flex-1">
            <span className="mr-1.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] font-semibold tracking-wider text-muted-foreground">{i.tag}</span>
            <span className="text-xs text-foreground/80">{i.label}</span>
            <span className="ml-1 text-2xs text-muted-foreground">· {fmtTs(i.ts)}</span>
          </div>
        </div>
      ))}
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
  checklist, busy, onToggle,
}: {
  checklist: PersonCardData['checklist']
  busy: string | null
  onToggle: (fieldId: string, complete: boolean) => void
}) {
  const open = checklist.totalCount - checklist.completedCount
  return (
    <div className="jubo-los-card p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold tracking-tight text-jubo-navy">Conditions</p>
        {checklist.hasChecklist && (
          <span className="rounded-full bg-jubo-gold-soft px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-jubo-gold">{open} open</span>
        )}
      </div>
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
      ) : <p className="text-2xs text-jubo-muted">No conditions for this stage.</p>}
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
                className="rounded-md bg-jubo-navy px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-navy2">Open in mail</a>
            </div>
          </div>
        ) : <p className="text-2xs text-muted-foreground">No email on file for this contact.</p>
      ) : mode === 'note' ? (
        <div className="space-y-1.5">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Write a note…"
            className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
          <div className="flex justify-end">
            <button onClick={saveNote} disabled={!text.trim() || pending}
              className="rounded-md bg-jubo-navy px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-navy2 disabled:opacity-50">{pending ? 'Saving…' : 'Save note'}</button>
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
              className="ml-auto rounded-md bg-jubo-navy px-2.5 py-1 text-2xs font-medium text-white hover:bg-jubo-navy2 disabled:opacity-50">{pending ? 'Adding…' : 'Add task'}</button>
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

