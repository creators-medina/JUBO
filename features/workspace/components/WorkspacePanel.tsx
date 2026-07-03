'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Maximize2, ArrowRightLeft, Phone, Mail } from 'lucide-react'
import { MoveToBoardDialog } from '@/features/boards/components/MoveToBoardDialog'
import { InlineRenameText } from '@/components/primitives/InlineRenameText'
import { updateRecord } from '@/features/records/actions'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTabs } from '../providers/WorkspaceTabsProvider'
import { PersonFileCard } from '@/features/person-card/PersonFileCard'
import { StageTracker } from '../command/StageTracker'
import { useWorkspaceKeyboard } from '../hooks/useWorkspaceKeyboard'
import { resolveWorkspaceTemplate } from '@/features/mortgage/templates/resolve'
import { getContactHealth } from '@/features/communications/metrics'
import type { ContactHealth, CommunicationLog } from '@/features/communications/types'
import type { MortgageData } from '@/features/mortgage/types'
import type {
  RecordRow, FieldRow, FieldValueRow, ActivityRow, TaskRow, MovementRow, GroupRow,
} from '../hooks/useWorkspaceData'
import type { NoteRow } from '../types'

// Minimal board shape (only the columns the chrome/header query selects).
type BoardLite = { id: string; name: string; slug: string; board_type: string }

// Shared shape for the loaded record bundle. Kept exported because the parked
// LOS Command-Center (features/workspace/command/LosCommandCenter.tsx) types
// against it for the Phase C3 harvest.
export type Loaded = {
  // RecordRow omits description + owner_user_id (real columns); the parked
  // LosCommandCenter reads description, and the header resolves the owner name.
  record: RecordRow & { description: string | null; owner_user_id: string | null }
  board: BoardLite | null
  communications: CommunicationLog[]
  fields: FieldRow[]
  // value_bool: the parked LosCommandCenter reads it (a typo for value_boolean,
  // undefined at runtime); typed here only so that dead file stays compilable.
  fieldValues: (FieldValueRow & { value_bool?: boolean | null })[]
  activities: ActivityRow[]
  // TaskRow omits created_by (set at creation); the row + parked LosCommandCenter
  // read it, including in a `?? `-fallback index, so model it as a non-null string.
  tasks: (TaskRow & { created_by: string })[]
  movements: MovementRow[]
  notes: NoteRow[]
  // GroupRow omits position (a real column); StageTracker sorts groups by it.
  groups: (GroupRow & { position?: number | null })[]
  profiles: Record<string, string>
  currentUserId: string | null
}

export function WorkspacePanel() {
  const { tabs, activeRecordId, closeWorkspace, closeAll } = useWorkspaceTabs()
  const activeTab = tabs.find(t => t.recordId === activeRecordId) ?? null

  // Keyboard: Esc closes the active workspace.
  useWorkspaceKeyboard({
    enabled: !!activeRecordId,
    onClose: closeAll,
  })

  if (!activeTab) return null

  return (
    <WorkspaceContent
      key={activeTab.recordId}
      recordId={activeTab.recordId}
      onClose={() => closeWorkspace(activeTab.recordId)}
    />
  )
}

function WorkspaceContent({
  recordId, onClose,
}: {
  recordId: string
  onClose: () => void
}) {
  const router = useRouter()
  const { openWorkspace } = useWorkspaceTabs()
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMove, setShowMove] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    try {
      const [rRes, userRes] = await Promise.all([
        supabase.from('records').select('*').eq('id', recordId).single(),
        supabase.auth.getUser(),
      ])
      const record = rRes.data
      const currentUserId = userRes.data.user?.id ?? null
      if (!record) { setData(null); setLoading(false); return }

      const [fieldsRes, fvRes, aRes, tRes, mRes, gRes, nRes, bRes, cRes] = await Promise.all([
        supabase.from('fields').select('*').eq('board_id', record.board_id).order('position'),
        supabase.from('field_values').select('*').eq('record_id', recordId),
        supabase.from('activities').select('*').eq('record_id', recordId).order('created_at', { ascending: false }).limit(40),
        supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
        supabase.from('record_movements').select('*, from_group:from_group_id(name), to_group:to_group_id(name)').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20),
        supabase.from('board_groups').select('*').eq('board_id', record.board_id).eq('is_archived', false).order('position'),
        supabase.from('notes').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
        supabase.from('boards').select('id, name, slug, board_type').eq('id', record.board_id).single(),
        supabase.from('communication_logs').select('*').eq('record_id', recordId).order('occurred_at', { ascending: false }),
      ])

      // Resolve actor names from the record owner + activities/tasks/notes/movements
      const userIds = new Set<string>()
      if (record.owner_user_id) userIds.add(record.owner_user_id)
      for (const a of aRes.data ?? []) if (a.user_id) userIds.add(a.user_id)
      for (const t of tRes.data ?? []) { if (t.created_by) userIds.add(t.created_by); if (t.assigned_user_id) userIds.add(t.assigned_user_id) }
      for (const n of nRes.data ?? []) if (n.author_user_id) userIds.add(n.author_user_id)
      for (const m of mRes.data ?? []) if (m.user_id) userIds.add(m.user_id)
      const profiles: Record<string, string> = {}
      if (userIds.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', [...userIds])
        for (const p of profs ?? []) {
          profiles[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
        }
      }

      // Refresh the tab title once we know the record name
      openWorkspace({ recordId, title: record.title })

      setData({
        record,
        board: bRes.data ?? null,
        communications: cRes.data ?? [],
        fields: fieldsRes.data ?? [],
        fieldValues: fvRes.data ?? [],
        activities: aRes.data ?? [],
        tasks: tRes.data ?? [],
        movements: mRes.data ?? [],
        notes: nRes.data ?? [],
        groups: gRes.data ?? [],
        profiles,
        currentUserId,
      })
    } finally {
      setLoading(false)
    }
  }, [recordId, openWorkspace])

  // Load the record bundle on mount and whenever the record changes (async
  // data-load — load() sets loading/data; must run as an effect, not in render).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Refetch when the page revalidates
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const contactHealth: ContactHealth = data ? getContactHealth(data.communications) : 'unknown'

  // Header identity bits — the single command header carries everything the card
  // used to duplicate: role · board · owner · phone, plus call/email actions.
  const roleLabel = data ? (resolveWorkspaceTemplate(data as unknown as MortgageData)?.label ?? '') : ''
  const ownerName = data?.record?.owner_user_id ? (data.profiles[data.record.owner_user_id] ?? null) : null
  const boardName = data?.board?.name ?? null
  // Contact lookup — slug first, then field_type, matching how the borrower
  // mirror and the card's comms context resolve the record's phone/email, so a
  // board whose phone/email field uses a different slug still shows here.
  const fieldValBySlug = useCallback((slug: string, fieldType?: string): string | null => {
    if (!data) return null
    const bySlug = data.fields.find((x) => x.slug === slug)
    const f = bySlug ?? (fieldType ? data.fields.find((x) => x.field_type === fieldType) : undefined)
    if (!f) return null
    return data.fieldValues.find((v) => v.field_id === f.id)?.value_text ?? null
  }, [data])
  const phone = useMemo(() => fieldValBySlug('phone', 'phone'), [fieldValBySlug])
  const email = useMemo(() => fieldValBySlug('email', 'email'), [fieldValBySlug])
  const subline = [roleLabel, boardName, ownerName].filter(Boolean).join(' · ')

  return (
    // Phase C-LAYOUT — the record file is a CENTERED floating modal over a dimmed,
    // blurred board (was a right-side drawer). Click-outside still closes.
    <div className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-jubo-navy/40 backdrop-blur-sm" onClick={onClose} />
      {/* Fixed workspace height (reference: min(884px, viewport − 52px)) — the
          modal never stretches the page; the file card scrolls internally. */}
      <div className="relative flex h-[min(884px,calc(100vh-52px))] w-full max-w-[80rem] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {/* Window chrome — borrower identity (left) + panel controls (right). The
            record's four-tab File Card (Overview / Loan & Property / Borrower /
            Financial) is the entire body below. */}
        <header className="flex items-center justify-between gap-3 px-5 py-2 border-b border-jubo-navy2 bg-jubo-navy flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {loading ? (
              <div className="h-10 w-10 rounded-lg bg-white/10 animate-pulse flex-shrink-0" />
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-jubo-red text-sm font-semibold text-white shadow-sm">
                {initials(data?.record?.title)}
              </div>
            )}
            <div className="min-w-0">
              {loading ? (
                <div className="h-6 w-56 bg-white/10 rounded animate-pulse" />
              ) : (
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-white">
                  {data && (
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: contactHealth === 'healthy' ? 'var(--jubo-green)' : contactHealth === 'warming' ? 'var(--jubo-gold)' : contactHealth === 'stale' ? 'var(--jubo-red)' : 'rgba(255,255,255,0.3)' }}
                      title={`Contact health: ${contactHealth}`}
                      aria-hidden
                    />
                  )}
                  {/* Inline contact rename — records.title is the canonical
                      display name (the common-field registry never binds a
                      field to `name` by design); saves through the existing
                      updateRecord write path only. */}
                  {data?.record ? (
                    <InlineRenameText
                      value={data.record.title ?? 'Record'}
                      className="min-w-0 truncate"
                      inputClassName="text-xl font-bold tracking-tight bg-white/10 border-white/30 text-white focus:ring-white/50"
                      onSave={async (next) => {
                        await updateRecord(recordId, data.record.board_id ?? '', { title: next })
                        openWorkspace({ recordId, title: next }) // keep the tab label in sync
                        load()
                        router.refresh()
                      }}
                    />
                  ) : (
                    <span className="truncate">Record</span>
                  )}
                </h2>
              )}
              {data && (
                <p className="mt-0.5 truncate text-2xs text-jubo-gold-soft/70">
                  {subline}
                  {phone ? <>{subline ? ' · ' : ''}<span className="tabular-nums text-white/80">{phone}</span></> : null}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {phone && (
              <a
                href={`tel:${phone}`}
                title="Call"
                className="rounded-lg bg-jubo-red p-2 text-white shadow-sm transition-colors hover:bg-jubo-red-dark"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                title="Email"
                className="rounded-lg border border-white/10 bg-jubo-navy2 p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Mail className="h-4 w-4" />
              </a>
            )}

            {data?.record?.board_id && (
              <button onClick={() => setShowMove(true)} title="Move to another board"
                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            )}
            {data?.record?.board_id && (
              <Link href={`/boards/${data.record.board_id}`} title="Open in board"
                className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <Maximize2 className="h-4 w-4" />
              </Link>
            )}
            <button onClick={onClose} title="Close (esc)"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Pipeline stage indicator (NOT tabs) — continues the navy header. */}
        {data && (
          <div className="flex flex-shrink-0 justify-start border-b border-jubo-navy2 bg-jubo-navy px-5 pb-2 pt-0.5 sm:justify-center">
            <StageTracker groups={data.groups} currentGroupId={data.record.group_id ?? null} />
          </div>
        )}

        {showMove && data?.record?.board_id && (
          <MoveToBoardDialog
            recordIds={[recordId]}
            currentBoardId={data.record.board_id}
            onClose={() => setShowMove(false)}
            onMoved={() => { setShowMove(false); load(); router.refresh() }}
          />
        )}

        {/* Body — the four-tab File Card owns its own strip/tabs and scrolls
            internally (strip + tabs stay pinned inside the fixed-height shell). */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-5 pt-4">
          {loading && !data ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-8 bg-surface-1 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : (
            <PersonFileCard recordId={recordId} onRequestClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Up to two initials from a record title for the header avatar. */
function initials(title?: string | null): string {
  const parts = (title ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
