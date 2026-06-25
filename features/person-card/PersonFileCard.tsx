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

import { useEffect, useState, useCallback } from 'react'
import {
  Loader2, Phone, Mail, MessageSquare, CheckSquare, Square, Plug, ArrowUpRight, ArrowDownLeft, ChevronRight,
} from 'lucide-react'
import { getPersonCardData, type PersonCardData } from './actions'
import { getCommunicateContext, type CommunicateContext } from '@/features/communications/communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { upsertFieldValue } from '@/features/records/actions'
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
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    getPersonCardData(recordId).then(setCard).catch(() => setCard(null))
    getCommunicateContext(recordId).then(setComms).catch(() => setComms(null))
  }, [recordId])
  useEffect(() => { load() }, [load])

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

  // Phase C2 — card shape from the existing template resolver (NOT board names).
  // Loan-like boards (loan/lead) get the full loan File Card; every other board
  // (generic/partner/past_client) gets a generic record card: the same universal
  // shell (feed, checklist, notes) without the loan framing and loan-only tabs.
  const isLoanLike = card.templateKey === 'loan' || card.templateKey === 'lead'
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* LEFT — snapshot/summary + real checklist */}
          <div className="space-y-4">
            {isLoanLike ? (
              <>
                <Section title="Loan snapshot">
                  <Field label="Loan Amount" value={bind('loan_amount')} />
                  <Field label="Purchase / Appraised Value" value={null} />
                  <Field label="Interest Rate" value={null} />
                  <Field label="Loan Program" value={bind('loan_type')} />
                </Section>
                <Section title="Property snapshot">
                  <Field label="Address" value={bind('property_address')} />
                  <Field label="Property Type" value={null} />
                </Section>
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

          {/* RIGHT — file summary (loan boards only) + real notes */}
          <div className="space-y-4">
            {isLoanLike && (
              <div className="rounded-xl border border-jubo-navy/20 bg-jubo-navy/5 p-3">
                <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">File summary</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <Metric label="FICO" value={bind('fico') /* not seeded → placeholder */} />
                  <Metric label="Program" value={bind('loan_type')} />
                  <Metric label="Loan Amount" value={bind('loan_amount')} />
                  <Metric label="Occupancy" value={bind('occupancy')} />
                  <Metric label="DTI" computed />
                  <Metric label="LTV" computed />
                  <Metric label="PI" computed />
                  <Metric label="TI" computed />
                  <Metric label="Income" value={null} />
                  <Metric label="Assets" value={null} />
                </div>
              </div>
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
      <p className="px-3 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
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
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('truncate text-xs', value && !computed ? 'text-foreground' : 'text-muted-foreground/50')}>{computed ? '—' : (value || '—')}</p>
      {computed && <p className="text-[9px] text-muted-foreground/40">calculated once financials are added</p>}
    </div>
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
