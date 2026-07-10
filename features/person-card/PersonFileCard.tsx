'use client'

// ─────────────────────────────────────────────────────────────────────────
// Person / File Card — Layout 4a trifold workspace.
//
// Loan-shaped records render as THREE floating cards on the workspace desk:
// Conversations (left) · the Hub (middle: header slot + stage stepper +
// metric strip + section rail + section content) · Notes & Tasks (right).
// Both side cards fold independently into narrow spines (content fully
// unmounted while folded) and the hub widens into the freed space.
//
// Layout/IA restructure ONLY: every field keeps its source, every action
// keeps its existing handler (getFileCardData read model, upsertFieldValue,
// moveRecord, createNote/createTask, SMSComposeBox, quickCallOutcome).
// Generic-shaped records keep their existing single-card layout untouched.
// Computed metrics (LTV/DTI) stay the same display-only derivations —
// never fabricated; DSCR/LTC still render an honest "—".
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback, useRef, useTransition } from 'react'
import { Loader2, CheckSquare, Square, Plug, LayoutGrid, Landmark, User, DollarSign } from 'lucide-react'
import { getFileCardData, type PersonCardData, type LoanCommandData } from './actions'
import { deriveLoanMetrics, LoanSummaryStrip, SummaryMetric, SnapRow, nameInitials } from './FileSummary'
import type { CommunicateContext } from '@/features/communications/communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { createNote } from '@/features/workspace/notes/actions'
import { createTask } from '@/features/tasks/actions'
import { LoanPropertyTab } from './LoanPropertyTab'
import { LeadSourceCard } from './LeadSourceCard'
import { QuickContact } from './QuickContact'
// Step 9 split — the messaging pieces (Feed timeline + Composer) moved
// verbatim to cardMessaging.tsx; behavior identical.
import { Feed, type Filter } from './cardMessaging'
import { BorrowerTab } from './BorrowerTab'
import { FinancialTab } from './FinancialTab'
import { upsertFieldValue, moveRecord } from '@/features/records/actions'
// Phase C3 — harvested LOS Command-Center pieces (reused, not rebuilt).
import { NextActionCard } from '@/features/workspace/components/NextActionCard'
import { ParticipantRibbon } from '@/features/workspace/command/ParticipantRibbon'
import { computeOpportunitySignals } from '@/features/mortgage/scoring/opportunities'
// Layout 4a — side cards (Conversations · Notes & Tasks) + spine collapse.
import { ConversationsCard, NotesTasksCard, type SideTab } from './trifoldCards'
import { LOCAL_KEYS } from '@/lib/localKeys'
import { useToast } from '@/features/feedback/ToastProvider'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'loan' | 'borrower' | 'financial'

// Same section keys/labels as the previous tab strip (labels unchanged);
// icons are presentation-only for the 4a rail. Documents is deliberately
// absent: no document list/status model exists in the app today, and the
// 4a ground rule is to never invent data.
const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
  { key: 'overview', label: 'Overview', Icon: LayoutGrid },
  { key: 'loan', label: 'Loan & Property Info', Icon: Landmark },
  { key: 'borrower', label: 'Borrower Info', Icon: User },
  { key: 'financial', label: 'Financial Info', Icon: DollarSign },
]

// Trifold column widths per fold state (full literal classes so Tailwind
// JIT sees them). Side cards ~320px expanded / 84px spine; the hub takes
// the freed space, with the grid-template transition animating the shift.
const TRIFOLD_GRID: Record<string, string> = {
  'open-open': 'xl:grid-cols-[340px_minmax(0,1fr)_340px]',
  'closed-open': 'xl:grid-cols-[92px_minmax(0,1fr)_340px]',
  'open-closed': 'xl:grid-cols-[340px_minmax(0,1fr)_92px]',
  'closed-closed': 'xl:grid-cols-[92px_minmax(0,1fr)_92px]',
}

/** Record-summary ordering (operator audit): contact info first. */
function summaryRank(f: { name: string; fieldType: string }): number {
  if (f.fieldType === 'phone') return 0
  if (f.fieldType === 'email') return 1
  const n = f.name.toLowerCase()
  if (n.includes('lead source') || n === 'source') return 2
  return 3
}

export function PersonFileCard({ recordId, onRequestClose, headerSlot }: {
  recordId: string
  onRequestClose?: () => void
  /** Layout 4a — the workspace header + stage stepper, passed down from
   *  WorkspacePanel so they render INSIDE the hub card (same JSX, same
   *  data and handlers; only where it renders moved). */
  headerSlot?: React.ReactNode
}) {
  const [card, setCard] = useState<PersonCardData | null | undefined>(undefined)
  const [comms, setComms] = useState<CommunicateContext | undefined>(undefined)
  // Phase C3 — current-board command bundle (loan shape only).
  const [loan, setLoan] = useState<LoanCommandData | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  // Layout 4a — trifold layout state (side-card folds + right-card tab),
  // persisted per user + record through the localStorage key registry.
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [sideTab, setSideTab] = useState<SideTab>('notes')
  const prefsUid = useRef<string | null>(null)
  // Phase D9 — composer draft state lives here so the ALWAYS-VISIBLE
  // bottom-right Save footer can act on it (honest per-mode behavior).
  const [composerMode, setComposerMode] = useState<'sms' | 'email' | 'note' | 'task'>('sms')
  const [composerText, setComposerText] = useState('')
  const [composerPending, startComposerSave] = useTransition()
  // Footer save failures are shown inline (never silent); the SMS draft mirror +
  // discard-confirm keep the footer Save from throwing away an unsent message.
  const [composerError, setComposerError] = useState<string | null>(null)
  const [smsDraft, setSmsDraft] = useState('')
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  // Anchor for the Text/Note jumps — the Conversations card (loan trifold)
  // or the Activity & messages section (generic shape).
  const conversationAnchorRef = useRef<HTMLDivElement>(null)
  // The card must OPEN at the top (Quick Contact visible). Guards against any
  // child stealing scroll on mount (e.g. an autofocused input being scrolled
  // into view) — reset the tab body's scroll whenever content/tab mounts.
  const tabBodyRef = useRef<HTMLDivElement>(null)
  const toast = useToast()

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

  // Open at the top — once when the card content first arrives, and on every
  // tab switch. Later reloads (e.g. after sending an SMS) keep the user's
  // scroll position.
  const openedAtTop = useRef(false)
  useEffect(() => {
    if (card && !openedAtTop.current) {
      openedAtTop.current = true
      tabBodyRef.current?.scrollTo({ top: 0 })
    }
  }, [card])
  useEffect(() => { tabBodyRef.current?.scrollTo({ top: 0 }) }, [tab])

  // Layout 4a — hydrate the saved trifold layout (folds · hub section ·
  // Notes/Tasks tab) once the comms context resolves the user id. Saved
  // values are strictly validated; anything unexpected keeps the defaults.
  useEffect(() => {
    if (comms === undefined) return
    const uid = comms?.currentUserId ?? null
    prefsUid.current = uid
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      if (window.localStorage.getItem(LOCAL_KEYS.contactCardLeftCollapsed(uid, recordId)) === '1') setLeftCollapsed(true)
      if (window.localStorage.getItem(LOCAL_KEYS.contactCardRightCollapsed(uid, recordId)) === '1') setRightCollapsed(true)
      const savedSection = window.localStorage.getItem(LOCAL_KEYS.contactCardHubSection(uid, recordId))
      if (savedSection && TABS.some((t) => t.key === savedSection)) setTab(savedSection as Tab)
      const savedSideTab = window.localStorage.getItem(LOCAL_KEYS.contactCardSideTab(uid, recordId))
      if (savedSideTab === 'notes' || savedSideTab === 'tasks') setSideTab(savedSideTab)
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch { /* defaults stand */ }
  }, [comms, recordId])

  // Preference writes (per-browser UI state only — never backend).
  const savePref = (key: string, value: string) => {
    try { window.localStorage.setItem(key, value) } catch { /* view-only */ }
  }
  const toggleLeft = () => setLeftCollapsed((c) => {
    savePref(LOCAL_KEYS.contactCardLeftCollapsed(prefsUid.current, recordId), c ? '0' : '1')
    return !c
  })
  const toggleRight = () => setRightCollapsed((c) => {
    savePref(LOCAL_KEYS.contactCardRightCollapsed(prefsUid.current, recordId), c ? '0' : '1')
    return !c
  })
  const selectSection = (t: Tab) => {
    setTab(t)
    savePref(LOCAL_KEYS.contactCardHubSection(prefsUid.current, recordId), t)
  }
  const selectSideTab = (t: SideTab) => {
    setSideTab(t)
    savePref(LOCAL_KEYS.contactCardSideTab(prefsUid.current, recordId), t)
  }

  if (card === undefined) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-lg">
        {headerSlot}
        <div className="flex items-center gap-2 px-5 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading file…</div>
      </div>
    )
  }
  if (card === null) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-lg">
        {headerSlot}
        <div className="m-5 rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">File unavailable for this record.</div>
      </div>
    )
  }

  const email = comms?.email ?? null
  const boardId = card.record.boardId

  // Phase C2 — card shape from the existing template resolver (NOT board names).
  // Loan-like boards (loan/lead) get the full loan File Card; every other board
  // (generic/partner/past_client) gets a generic record card: the same universal
  // shell (feed, checklist, notes) without the loan framing and loan-only tabs.
  const isLoanLike = card.templateKey === 'loan' || card.templateKey === 'lead'
  const activeTab: Tab = isLoanLike ? tab : 'overview'

  // Phase D5 — resolve every summary metric ONCE from the already-loaded loan
  // bundle (read-only: direct slug reads + display-only LTV/DTI derivations).
  const m = isLoanLike && loan ? deriveLoanMetrics(loan) : null
  const rec = (loan?.record ?? {}) as { title?: string; next_action?: string | null; next_action_completed_at?: string | null }
  const borrowerName = rec.title ?? 'Borrower'
  const openTaskCount = (card.tasks as { completed_at: string | null }[]).filter((t) => !t.completed_at).length

  // Quick Contact → Text: jump to the EXISTING SMS composer (loan shape:
  // the Conversation card's pinned composer; generic shape: the Activity &
  // messages compose box). The send flow itself is untouched.
  const jumpToText = () => {
    // Loan trifold: make sure the Conversations card is unfolded, in SMS mode.
    if (isLoanLike) { setLeftCollapsed(false); setComposerMode('sms') }
    // Let the layout render before scrolling to the composer area.
    setTimeout(() => conversationAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }

  const toggleChecklist = (fieldId: string, complete: boolean) => {
    if (!boardId) return
    setBusy(fieldId)
    upsertFieldValue(fieldId, card.record.id, boardId, { value_boolean: !complete })
      .then(load)
      .catch((e) => toast.error(`Couldn't save checklist item — ${e instanceof Error ? e.message : 'please try again'}`))
      .finally(() => setBusy(null))
  }


  // Secondary-card content by key — every card reuses the existing actions
  // and data; nothing here adds a write path.
  const railTasks = card.tasks as RailTask[]
  const signals = loan ? computeOpportunitySignals(loan, card.templateKey).slice(0, 3) : []

  // Footer Save — the same existing actions the composer used (createNote /
  // createTask); nothing new is written anywhere.
  const footerSave = () => {
    const content = composerText.trim()
    if (!content) return
    startComposerSave(async () => {
      try {
        if (composerMode === 'note') {
          await createNote({ organization_id: card.record.organizationId, record_id: recordId, content })
        } else if (composerMode === 'task' && boardId) {
          await createTask({ organization_id: card.record.organizationId, record_id: recordId, board_id: boardId, title: content })
        }
        setComposerText('')
        setComposerError(null)
        load()
      } catch (e) {
        setComposerError(`Couldn't save — ${e instanceof Error ? e.message : 'please try again'}`) // draft kept
      }
    })
  }

  // Footer `Save` = save-and-leave: persist an explicit Note/Task draft first
  // (the user typed it into that composer mode — same actions as above), then
  // close the card. Server state is already autosaved; nothing else is sent —
  // never SMS, never email, no broad save-all mutation.
  const footerSaveAndClose = () => {
    const content = composerText.trim()
    const hasSaveableDraft = content && (composerMode === 'note' || (composerMode === 'task' && boardId))
    if (!hasSaveableDraft) {
      // Guard: an unsent SMS/email draft would be lost by closing. First click
      // warns; a second click confirms the close. Nothing is ever auto-sent.
      const unsent = (composerMode === 'sms' && smsDraft.trim()) || (composerMode === 'email' && content)
      if (unsent && !confirmDiscard) { setConfirmDiscard(true); return }
      onRequestClose?.()
      return
    }
    startComposerSave(async () => {
      try {
        if (composerMode === 'note') {
          await createNote({ organization_id: card.record.organizationId, record_id: recordId, content })
        } else if (composerMode === 'task' && boardId) {
          await createTask({ organization_id: card.record.organizationId, record_id: recordId, board_id: boardId, title: content })
        }
        setComposerText('')
        setComposerError(null)
        onRequestClose?.()
      } catch (e) {
        setComposerError(`Couldn't save — ${e instanceof Error ? e.message : 'please try again'}`) // draft kept, card stays open
      }
    })
  }

  // Persistent card footer — an always-clickable `Save` that saves any
  // explicit Note/Task draft (the same existing createNote/createTask the
  // composer uses) and then closes the card. It never sends SMS/email: SMS
  // keeps its real Send inside the composer, and an email draft keeps its
  // honest "Open in mail" action alongside. Identical on both card shapes.
  const footer = (
    <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-jubo-border-strong/60 px-3.5 py-2">
      <span className="text-2xs text-jubo-muted">Changes save automatically</span>
      <div className="flex min-w-0 items-center gap-2">
        {composerError && <span className="truncate text-2xs font-medium text-jubo-red">{composerError}</span>}
        {!composerError && confirmDiscard && (
          <span className="truncate text-2xs font-medium text-jubo-red">
            Unsent {composerMode === 'sms' ? 'text' : 'email'} draft — Save again to close without sending
          </span>
        )}
        {isLoanLike && composerMode === 'email' && email && composerText.trim() && (
          <a
            href={`mailto:${email}?body=${encodeURIComponent(composerText)}`}
            className="rounded-md border border-jubo-red px-4 py-1.5 text-xs font-semibold text-jubo-red transition-colors hover:bg-jubo-red/10"
          >
            Open in mail
          </a>
        )}
        <button
          onClick={footerSaveAndClose}
          disabled={composerPending}
          title={
            isLoanLike && composerText.trim() && (composerMode === 'note' || (composerMode === 'task' && boardId))
              ? 'Save the current draft and close'
              : 'Everything is saved automatically — close the card'
          }
          className="rounded-md bg-jubo-red px-5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-jubo-red-dark disabled:opacity-60"
        >
          {composerPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )

  // ── Layout 4a — LOAN shape: three floating cards on the desk. Below xl
  //    the trifold stacks (hub first) and the page scrolls; on xl the side
  //    cards top-align at natural height while the hub fills the desk. ──
  if (isLoanLike) {
    const gridClass = TRIFOLD_GRID[`${leftCollapsed ? 'closed' : 'open'}-${rightCollapsed ? 'closed' : 'open'}`]
    return (
      <div className={cn(
        // Mobile/tablet: a simple scrolling column (auto heights, hub first
        // via order classes). xl+: the 3-column trifold grid with a definite
        // height, animated column transitions, and stretch alignment.
        'flex h-full min-h-0 flex-col gap-4 overflow-y-auto',
        'xl:grid xl:grid-cols-1 xl:content-stretch xl:items-stretch xl:overflow-visible xl:transition-[grid-template-columns] xl:duration-300',
        gridClass,
      )}>
        {/* LEFT — Conversations (or its folded spine). */}
        <div className="order-2 flex shrink-0 flex-col xl:order-none xl:min-h-0 xl:h-full xl:max-h-full">
          <ConversationsCard
            collapsed={leftCollapsed}
            onToggle={toggleLeft}
            card={card}
            comms={comms}
            recordId={recordId}
            email={email}
            borrowerName={borrowerName}
            ownerName={m?.ownerName ?? null}
            filter={filter}
            onFilterChange={setFilter}
            onChanged={load}
            composerMode={composerMode}
            onComposerModeChange={(mode) => { setComposerMode(mode); setConfirmDiscard(false) }}
            composerText={composerText}
            onComposerTextChange={(t) => { setComposerText(t); setConfirmDiscard(false); setComposerError(null) }}
            onComposerSubmit={footerSave}
            onSmsDraftChange={(t) => { setSmsDraft(t); setConfirmDiscard(false) }}
            anchorRef={conversationAnchorRef}
          />
        </div>

        {/* MIDDLE — the Hub: header · stepper · metric strip · section rail
            + section content · footer. */}
        <div className="order-1 flex shrink-0 flex-col overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-2xl xl:order-none xl:min-h-0 xl:h-full xl:self-stretch">
          {headerSlot}
          {/* Metric strip — Loan Amount · LTV · FICO · Rate · DSCR · LTC ·
              Est. Closing · Type. Real values or an honest "—". */}
          {m && <div className="flex-shrink-0 px-3.5 pt-2.5"><LoanSummaryStrip m={m} compact /></div>}

          {/* flex-1 only once the workspace has a definite height (xl) —
              in the stacked mobile flow it would collapse to zero. */}
          <div className="grid min-h-0 grid-cols-1 content-start gap-3.5 p-3.5 sm:grid-cols-[160px_minmax(0,1fr)] xl:flex-1 xl:content-stretch">
            {/* Rail — section menu (client-side switching only) + the
                existing Next Step block and opportunity signals. */}
            <div className="flex min-h-0 flex-col gap-3 sm:overflow-y-auto">
              <div>
                <p className="jubo-los-section-label mb-1.5">Sections</p>
                <div className="flex flex-row flex-wrap gap-1 sm:flex-col">
                  {TABS.map(({ key, label, Icon }) => (
                    <button
                      key={key}
                      onClick={() => selectSection(key)}
                      className={cn(
                        'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors',
                        activeTab === key
                          ? 'border-jubo-red/40 bg-white text-jubo-navy shadow-sm'
                          : 'border-transparent text-muted-foreground hover:bg-jubo-card-soft hover:text-foreground',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-auto space-y-2 pt-2">
                {loan && (
                  <NextActionCard
                    recordId={recordId}
                    nextAction={rec.next_action ?? null}
                    nextActionDueAt={(loan.record as { next_action_due_at?: string | null }).next_action_due_at ?? null}
                    nextActionCompletedAt={rec.next_action_completed_at ?? null}
                  />
                )}
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
              </div>
            </div>

            {/* Section content — existing groupings and bindings only. */}
            <div ref={tabBodyRef} className="min-h-0 sm:overflow-y-auto">
              {activeTab === 'overview' && (
                <div className="space-y-3">
                  {/* Loan Snapshot — the same resolved metrics as the strip,
                      loan amount dominant (values/formats unchanged). */}
                  <div className="jubo-los-card p-3.5">
                    <p className="jubo-los-section-label">Loan Snapshot</p>
                    <p className={cn('mt-1 text-[26px] font-bold leading-tight tracking-tight tabular-nums', m?.loanAmount ? 'text-jubo-navy' : 'text-jubo-muted/40')}>
                      {m?.loanAmount ?? '—'}
                    </p>
                    {m && (
                      <div className="mt-2 flex flex-wrap items-center divide-x divide-jubo-border/70">
                        <SummaryMetric label="LTV" value={m.ltv} />
                        <SummaryMetric label="Rate" value={m.rate} />
                        <SummaryMetric label="FICO" value={m.fico} />
                        <SummaryMetric label="Type" value={m.loanType ?? m.purpose} />
                        <SummaryMetric label="Est. Closing" value={m.closing} />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                    <div className="jubo-los-card p-3.5">
                      <p className="jubo-los-section-label mb-1.5">Property</p>
                      <div className="space-y-0.5">
                        <SnapRow label="Address" value={m?.address ?? null} />
                        <SnapRow label="City / State" value={m?.cityState ?? null} />
                        <SnapRow
                          label={m?.propertyValue ? 'Est. value' : m?.appraisedValue ? 'Appraised' : 'Value'}
                          value={m?.propertyValue ?? m?.appraisedValue ?? null}
                        />
                        <SnapRow label="Type" value={m?.propertyType ?? null} />
                        <SnapRow label="Occupancy" value={m?.occupancy ?? null} />
                      </div>
                    </div>

                    <div className="jubo-los-card p-3.5">
                      <p className="jubo-los-section-label mb-1.5">Financial Summary</p>
                      <div className="space-y-0.5">
                        <SnapRow label="Income" value={m?.income ?? null} />
                        <SnapRow label="Assets" value={m?.assets ?? null} />
                        <SnapRow label="Liabilities" value={m?.liabilities ?? null} />
                        <SnapRow label="DTI" value={m?.dti ?? null} />
                        <SnapRow label="DSCR" value={m?.dscr ?? null} />
                        <SnapRow label="Total PITI" value={m?.totalPiti ?? null} />
                      </div>
                    </div>
                  </div>

                  {/* 2.0 — collapsed by default: progress stays visible at
                      a glance, the item list expands on demand. */}
                  <PhaseChecklistCard
                    checklist={card.checklist}
                    stageName={m?.stage ?? null}
                    busy={busy}
                    onToggle={toggleChecklist}
                    collapsible
                  />

                  {/* Existing stage control preserved (same moveRecord path);
                      slimmed to one label + select row. */}
                  {loan && (
                    <div className="jubo-los-card flex items-center gap-3 px-3.5 py-2">
                      <p className="jubo-los-section-label flex-shrink-0">Move to Stage</p>
                      <div className="min-w-0 flex-1 sm:max-w-64 sm:ml-auto">
                        <MoveToStage
                          recordId={recordId}
                          boardId={loan.record.board_id}
                          groups={loan.groups as MoveGroup[]}
                          currentGroupId={loan.record.group_id ?? null}
                          onMoved={load}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'loan' && (
                <LoanPropertyTab recordId={recordId} boardId={card.record.boardId} organizationId={card.record.organizationId} />
              )}

              {activeTab === 'borrower' && (
                <div className="space-y-3.5">
                  <BorrowerTab recordId={recordId} />
                  {/* File team + contacts — the same participant data. */}
                  {loan && <ParticipantRibbon data={loan} />}
                  <div className="jubo-los-card p-3.5">
                    <p className="jubo-los-section-label mb-2">Contacts</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-jubo-red text-[10px] font-bold text-white">
                          {nameInitials(borrowerName)}
                        </span>
                        <div className="min-w-0 text-xs leading-tight">
                          <p className="truncate font-semibold text-jubo-text">{borrowerName}</p>
                          <p className="truncate text-2xs text-jubo-muted">Borrower{comms?.phone ? ` · ${comms.phone}` : ''}</p>
                        </div>
                      </div>
                      {m?.ownerName && (
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: '#3f83c4' }}>
                            {nameInitials(m.ownerName)}
                          </span>
                          <div className="min-w-0 text-xs leading-tight">
                            <p className="truncate font-semibold text-jubo-text">{m.ownerName}</p>
                            <p className="truncate text-2xs text-jubo-muted">Loan Officer</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Phase 5 — per-record lead-source attribution (planning-
                      honest: set by the LO, never inferred). */}
                  <LeadSourceCard recordId={recordId} boardId={boardId ?? null} organizationId={card.record.organizationId} />
                </div>
              )}

              {activeTab === 'financial' && (
                <FinancialTab recordId={recordId} />
              )}
            </div>
          </div>

          {footer}
        </div>

        {/* RIGHT — Notes & Tasks (or its folded spine). */}
        <div className="order-3 flex shrink-0 flex-col xl:order-none xl:min-h-0 xl:h-full xl:max-h-full">
          <NotesTasksCard
            collapsed={rightCollapsed}
            onToggle={toggleRight}
            activeTab={sideTab}
            onTabChange={selectSideTab}
            organizationId={card.record.organizationId}
            recordId={recordId}
            boardId={boardId ?? null}
            comms={comms}
            tasks={railTasks}
            openTaskCount={openTaskCount}
            onChanged={load}
          />
        </div>
      </div>
    )
  }

  // ── GENERIC shape — the existing single-card layout with unchanged
  //    content (Quick Contact bar included), now hosting the header slot
  //    at the top of its one card. ──
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-lg">
      {headerSlot}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
        {/* Quick Contact — call/text/email/log-call visible immediately, no
            scrolling (existing actions only; see QuickContact). */}
        <div className="flex-shrink-0">
          <QuickContact
            phone={comms?.phone ?? null}
            email={email}
            recordId={recordId}
            onText={jumpToText}
            onLogged={load}
          />
        </div>
        <div ref={tabBodyRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="min-w-0 space-y-4">

      {/* ── GENERIC-shape Overview (unchanged) ── */}
      {activeTab === 'overview' && !isLoanLike && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4">
            {/* Phase 5 — lead-source attribution on generic record cards too. */}
            <LeadSourceCard recordId={recordId} boardId={boardId ?? null} organizationId={card.record.organizationId} />
            <Section title="Record summary">
              {card.thisBoard.length > 0 ? (
                // Contact info first (operator audit): phone → email → lead
                // source lead the list so they're never buried mid-summary;
                // everything else keeps its original order (stable sort).
                [...card.thisBoard]
                  .sort((a, b) => summaryRank(a) - summaryRank(b))
                  .slice(0, 12)
                  .map((f) => <Field key={f.fieldId} label={f.name} value={f.value || null} />)
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

          <div className="space-y-3" ref={conversationAnchorRef}>
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
                <NoteList organizationId={card.record.organizationId} recordId={recordId} notes={comms.notes} currentUserId={comms.currentUserId} members={comms.members} prominent taskContext={boardId ? { boardId } : undefined} onChanged={load} />
              ) : <div className="flex items-center gap-2 py-2 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>}
            </Section>
          </div>
        </div>
      )}

          </div>
        </div>
        {footer}
      </div>
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

function PhaseChecklistCard({
  checklist, stageName, busy, onToggle, collapsible,
}: {
  checklist: PersonCardData['checklist']
  stageName?: string | null
  busy: string | null
  onToggle: (fieldId: string, complete: boolean) => void
  /** 2.0 — progress header always visible; the item list starts collapsed
   *  and expands on demand so the checklist stops driving Overview height. */
  collapsible?: boolean
}) {
  const [expanded, setExpanded] = useState(!collapsible)
  const showItems = !collapsible || expanded
  // Handoff layout — header (title · X/Y), progress bar with the current
  // stage name, then each item as a checkbox row. Same data + the same
  // existing toggle action.
  return (
    <div className="jubo-los-card overflow-hidden border-jubo-border-strong/60 shadow-sm">
      <div className="px-4 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-bold tracking-tight text-jubo-navy">Phase Checklist</p>
          <span className="flex items-center gap-1.5">
            {checklist.hasChecklist && (
              <span className="rounded-full bg-jubo-gold-soft px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-jubo-gold">
                {checklist.completedCount} / {checklist.totalCount}
              </span>
            )}
            {collapsible && checklist.hasChecklist && (
              <button
                onClick={() => setExpanded((e) => !e)}
                aria-expanded={showItems}
                className="rounded-md px-2 py-0.5 text-2xs font-medium text-jubo-muted transition-colors hover:bg-jubo-card-soft hover:text-jubo-text"
              >
                {showItems ? 'Hide items' : 'Show items'}
              </button>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-jubo-border/60">
            <div className="h-full rounded-full bg-jubo-green transition-all" style={{ width: `${checklist.percentage}%` }} />
          </div>
          {stageName && <span className="max-w-[9rem] truncate text-xs font-semibold text-jubo-muted">{stageName}</span>}
        </div>
      </div>
      {!showItems ? null : checklist.hasChecklist ? (
        checklist.items.map((i) => (
          <button
            key={i.fieldId}
            onClick={() => onToggle(i.fieldId, i.complete)}
            disabled={busy === i.fieldId}
            title={i.complete ? `Done: ${i.name} (click to un-check)` : `${i.name} (click to complete)`}
            className="flex w-full items-center gap-3 border-t border-jubo-border/60 px-4 py-2.5 text-left transition-colors hover:bg-jubo-card-soft disabled:opacity-60"
          >
            {busy === i.fieldId ? (
              <Loader2 className="h-[18px] w-[18px] flex-shrink-0 animate-spin text-jubo-muted" />
            ) : i.complete ? (
              <CheckSquare className="h-[18px] w-[18px] flex-shrink-0 text-jubo-green" />
            ) : (
              <Square className="h-[18px] w-[18px] flex-shrink-0 text-jubo-muted/70" />
            )}
            <span className={cn('text-[13px] font-medium text-jubo-text', i.complete && 'text-jubo-muted line-through')}>{i.name}</span>
          </button>
        ))
      ) : (
        <p className="border-t border-jubo-border/60 px-3.5 py-2.5 text-2xs text-jubo-muted">No checklist for this phase.</p>
      )}
    </div>
  )
}


// 4-mode composer — SMS (real Twilio), Note (real), Task (real), Email (mailto:
// opens the user's mail client; Jubo has no in-app email send, so this is an
// honest open-in-mail action, never a fake "Send").
// Narrow shape for the task fields the tasks card reads (source is any[]).
type RailTask = { id: string; title: string; completed_at: string | null; due_date: string | null }

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
  const toast = useToast()
  const sorted = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  if (sorted.length < 2) return null

  const onSelect = (toGroupId: string) => {
    if (!toGroupId || toGroupId === currentGroupId) return
    startTransition(async () => {
      try { await moveRecord(recordId, toGroupId, boardId) }
      catch (e) { toast.error(`Couldn't move stage — ${e instanceof Error ? e.message : 'please try again'}`) }
      onMoved()
    })
  }

  return (
    <div>
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
    </div>
  )
}

