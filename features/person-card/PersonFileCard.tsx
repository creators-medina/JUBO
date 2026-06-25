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
  Loader2, Phone, Mail, CheckSquare, Square, Plug, ArrowUpRight, ArrowDownLeft, ChevronRight,
} from 'lucide-react'
import { getPersonCardData, getLoanCommandData, type PersonCardData, type LoanCommandData } from './actions'
import { getCommunicateContext, type CommunicateContext } from '@/features/communications/communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { upsertFieldValue, moveRecord } from '@/features/records/actions'
// Phase C3 — harvested LOS Command-Center pieces (reused, not rebuilt).
import { NextActionCard } from '@/features/workspace/components/NextActionCard'
import { ParticipantRibbon } from '@/features/workspace/command/ParticipantRibbon'
import { computeOpportunitySignals } from '@/features/mortgage/scoring/opportunities'
import { textValue, numberValue, formatCurrency } from '@/features/mortgage/data'
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

  const load = useCallback(() => {
    getPersonCardData(recordId).then(setCard).catch(() => setCard(null))
    getCommunicateContext(recordId).then(setComms).catch(() => setComms(null))
  }, [recordId])
  const loadLoan = useCallback(() => {
    getLoanCommandData(recordId).then(setLoan).catch(() => setLoan(null))
  }, [recordId])
  useEffect(() => { load() }, [load])

  // Fetch the loan command bundle only for loan-like boards (after the card
  // resolves the template key) — generic boards never pay for it.
  const loanShape = !!card && (card.templateKey === 'loan' || card.templateKey === 'lead')
  useEffect(() => { if (loanShape) loadLoan() }, [loanShape, loadLoan])

  // Refetch on window focus so harvested mutations (Next Step, Move-To, which
  // call router.refresh()) reflect in this client-loaded card.
  useEffect(() => {
    const onFocus = () => { load(); if (loanShape) loadLoan() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load, loadLoan, loanShape])

  if (card === undefined) {
    return <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading file…</div>
  }
  if (card === null) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">File unavailable for this record.</div>
  }

  const bind = (key: string): string | null => card.common.find((c) => c.key === key)?.value || null
  const phone = comms?.phone ?? null
  const email = comms?.email ?? null
  const boardId = card.record.boardId

  // Phase C3 — bind to REAL stored board values via the LOS slug accessors when
  // present, else null (the caller falls back to a common-key value or an honest
  // placeholder). Never fabricates.
  const sv = (slug: string): string | null => (loan ? textValue(loan, slug) : null)
  const cv = (slug: string): string | null => {
    if (!loan) return null
    const n = numberValue(loan, slug)
    return n != null ? formatCurrency(n) : null
  }

  // Phase C2 — card shape from the existing template resolver (NOT board names).
  // Loan-like boards (loan/lead) get the full loan File Card; every other board
  // (generic/partner/past_client) gets a generic record card: the same universal
  // shell (feed, checklist, notes) without the loan framing and loan-only tabs.
  const isLoanLike = loanShape
  const visibleTabs = isLoanLike ? TABS : TABS.filter((t) => t.key === 'overview')
  const activeTab: Tab = isLoanLike ? tab : 'overview'

  const toggleChecklist = (fieldId: string, complete: boolean) => {
    if (!boardId) return
    setBusy(fieldId)
    upsertFieldValue(fieldId, card.record.id, boardId, { value_boolean: !complete }).then(load).finally(() => setBusy(null))
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{card.record.title}</h1>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              {card.currentBoard?.name ?? 'No board'}{card.currentGroup ? ` · ${card.currentGroup.name}` : ''}
              {card.ownerName ? ` · ${card.ownerName}` : ''}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {phone && <a href={`tel:${phone}`} title={`Call ${phone}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-1 hover:text-foreground"><Phone className="h-3.5 w-3.5" /></a>}
            {email && <a href={`mailto:${email}`} title={`Email ${email}`} className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-surface-1 hover:text-foreground"><Mail className="h-3.5 w-3.5" /></a>}
          </div>
        </div>
        {/* Tabs — a generic board shows only Overview, so the strip collapses. */}
        {visibleTabs.length > 1 && (
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {visibleTabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn('whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  activeTab === t.key ? 'bg-jubo-navy/10 text-jubo-navy' : 'text-muted-foreground hover:text-foreground')}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
        <div className={cn(
          'grid grid-cols-1 gap-4 lg:grid-cols-3',
          // Warm LOS canvas for the loan shape (harvested styling); generic stays plain.
          isLoanLike && 'jubo-los-page rounded-xl p-4',
        )}>
          {/* LEFT — snapshot/summary + real checklist */}
          <div className="space-y-4">
            {isLoanLike ? (
              <>
                <LosSection title="Loan">
                  <Field label="Loan Amount" value={cv('loan_amount') ?? bind('loan_amount')} />
                  <Field label="Purchase / Appraised Value" value={cv('purchase_price') ?? cv('appraised_value')} />
                  <Field label="Interest Rate" value={sv('interest_rate')} />
                  <Field label="Loan Program" value={sv('loan_type') ?? sv('loan_program') ?? bind('loan_type')} />
                </LosSection>
                <LosSection title="Property">
                  <Field label="Address" value={sv('property_address') ?? bind('property_address')} />
                  <Field label="Property Type" value={sv('property_type')} />
                </LosSection>
              </>
            ) : (
              // Generic board — real record fields, no loan framing.
              <Section title="Record summary">
                {card.thisBoard.length > 0 ? (
                  card.thisBoard.slice(0, 12).map((f) => <Field key={f.fieldId} label={f.name} value={f.value || null} />)
                ) : (
                  <p className="text-2xs text-muted-foreground">No fields on this record yet.</p>
                )}
              </Section>
            )}
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

          {/* CENTER — real comms feed */}
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

          {/* RIGHT — file summary + harvested LOS rail + real notes */}
          <div className="space-y-4">
            {isLoanLike && (
              <div className="jubo-los-card p-3">
                <p className="jubo-los-section-label mb-2">File summary</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {/* Stored values bind real-if-present (slug → common-key), else
                      placeholder. DTI/LTV show a real field value if one exists,
                      otherwise stay an honest "computed later" placeholder — never
                      calculated here (that's D2). */}
                  <Metric label="FICO" value={sv('credit_score') ?? sv('fico') ?? bind('fico')} />
                  <Metric label="Program" value={sv('loan_type') ?? sv('loan_program') ?? bind('loan_type')} />
                  <Metric label="Loan Amount" value={cv('loan_amount') ?? bind('loan_amount')} />
                  <Metric label="Occupancy" value={sv('occupancy') ?? bind('occupancy')} />
                  <Metric label="DTI" value={sv('dti')} computed />
                  <Metric label="LTV" value={sv('ltv')} computed />
                  <Metric label="PI" value={sv('principal_interest')} computed />
                  <Metric label="TI" value={sv('taxes_insurance')} computed />
                  <Metric label="Income" value={cv('monthly_income') ?? cv('annual_income')} />
                  <Metric label="Assets" value={cv('total_assets')} />
                </div>
              </div>
            )}

            {/* Harvested LOS rail — real Next Step, signals, tasks, file team,
                move-to. All read the current-board command bundle (loan). */}
            {isLoanLike && loan && (
              <CommandRail
                recordId={recordId}
                loan={loan}
                templateKey={card.templateKey}
                tasks={card.tasks}
                onChanged={() => { load(); loadLoan() }}
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

      {/* Loan-only tabs — never render on a generic board (also gated out of the
          tab strip above; the activeTab guard makes them unreachable there). */}
      {isLoanLike && activeTab === 'loan' && <ArriveShell title="Loan & Property Info" sections={['Loan Info', 'Property Info', 'Title Info']} />}
      {isLoanLike && activeTab === 'borrower' && (
        <ArriveShell
          title="Borrower Info"
          sections={['Basic Details', 'Declarations', 'Demographics', 'Address', 'Contact']}
          contact={{ phone, email }}
        />
      )}
      {isLoanLike && activeTab === 'financial' && (
        <ArriveShell title="Financial Info" sections={['Monthly Income', 'Assets', 'Liabilities', 'Real Estate Owned']} addable />
      )}
    </div>
  )
}

function Feed({ card, comms, filter }: { card: PersonCardData; comms: CommunicateContext | undefined; filter: Filter }) {
  type Item = { id: string; kind: 'sms' | 'activity'; ts: string; direction?: string; body?: string | null; label?: string; cat: Filter | 'other' }
  const items: Item[] = []
  for (const m of comms?.messages ?? []) items.push({ id: `s-${m.id}`, kind: 'sms', ts: m.occurred_at, direction: m.direction, body: m.body, cat: 'comms' })
  for (const a of card.activities) items.push({ id: `a-${a.id}`, kind: 'activity', ts: a.created_at, label: a.content ?? a.activity_type, cat: activityCategory(a.activity_type) })
  const shown = items
    .filter((i) => filter === 'all' || i.cat === filter)
    .sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))

  if (shown.length === 0) return <div className="px-3 py-6 text-center text-2xs text-muted-foreground">Nothing here yet.</div>
  return (
    <div className="max-h-72 space-y-1.5 overflow-y-auto p-3">
      {shown.map((i) => i.kind === 'sms' ? (
        <div key={i.id} className={cn('flex', i.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
          <div className={cn('max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs', i.direction === 'outbound' ? 'bg-jubo-navy/10' : 'bg-surface-2')}>
            <span className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
              {i.direction === 'outbound' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}{i.ts?.split('T')[0]}
            </span>{i.body}
          </div>
        </div>
      ) : (
        <div key={i.id} className="flex items-start gap-2 text-2xs text-muted-foreground">
          <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-border" />
          <span><span className="text-foreground/80">{i.label}</span> · {i.ts?.split('T')[0]}</span>
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

function Metric({ label, value, computed }: { label: string; value?: string | null; computed?: boolean }) {
  // A real stored value always wins. `computed` only governs the placeholder:
  // a derived metric (DTI/LTV/PI/TI) shows its honest "calculated later" caption
  // when no real field value exists — it is NEVER computed here.
  const hasReal = value != null && value !== ''
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('truncate text-xs', hasReal ? 'text-foreground' : 'text-muted-foreground/50')}>{hasReal ? value : '—'}</p>
      {computed && !hasReal && <p className="text-[9px] text-muted-foreground/40">calculated once financials are added</p>}
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
function CommandRail({
  recordId, loan, templateKey, tasks, onChanged,
}: {
  recordId: string
  loan: LoanCommandData
  templateKey: PersonCardData['templateKey']
  tasks: any[]
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
        groups={loan.groups}
        currentGroupId={loan.record.group_id ?? null}
        onMoved={onChanged}
      />
    </div>
  )
}

function MoveToStage({
  recordId, boardId, groups, currentGroupId, onMoved,
}: {
  recordId: string
  boardId: string
  groups: any[]
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

function ArriveShell({ title, sections, contact, addable }: { title: string; sections: string[]; contact?: { phone: string | null; email: string | null }; addable?: boolean }) {
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div key={s} className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{s}</p>
            {addable && <span className="cursor-not-allowed rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground/50">+ Add (coming soon)</span>}
          </div>
          {/* Bind values that genuinely exist; otherwise a clean coming-soon state. */}
          {s === 'Contact' && contact ? (
            <div className="mt-2 space-y-1">
              <Field label="Phone" value={contact.phone} />
              <Field label="Email" value={contact.email} />
            </div>
          ) : (
            <p className="mt-2 flex items-center gap-1 text-2xs text-muted-foreground/60"><ChevronRight className="h-3 w-3" /> This section is being built.</p>
          )}
        </div>
      ))}
    </div>
  )
}
