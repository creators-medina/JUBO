'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Maximize2, ArrowRightLeft, Phone, Mail } from 'lucide-react'
import { MoveToBoardDialog } from '@/features/boards/components/MoveToBoardDialog'
import { InlineRenameText } from '@/components/primitives/InlineRenameText'
import { deriveContactTags } from '@/features/prospecting/themeBuckets'
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
  // Derived category chips (Realtor/Agent · Active File · Pre-App · Past
  // Client · VIP) — read-only, from existing board/stage/type data. A true
  // editable tag model is a future backend phase.
  const contactTags = useMemo(() => {
    if (!data) return []
    const group = data.groups.find((g) => g.id === data.record.group_id)
    return deriveContactTags({
      boardName: data.board?.name ?? null,
      boardSlug: data.board?.slug ?? null,
      groupName: group?.name ?? null,
      recordType: (data.record as { record_type?: string | null }).record_type ?? null,
    })
  }, [data])

  // Layout 4a — the command header + stage stepper render INSIDE the hub
  // card (PersonFileCard's middle column) via this slot. Same JSX/data/
  // handlers; the 2.0 pass slims it into a compact navy identity strip
  // (smaller avatar, tighter rows) so the hub stops feeling top-heavy.
  const headerSlot = (
    <>
        <header className="flex items-center justify-between gap-3 px-4 py-1.5 border-b border-jubo-navy2 bg-jubo-navy flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {loading ? (
              <div className="h-8 w-8 rounded-md bg-white/10 animate-pulse flex-shrink-0" />
            ) : (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-jubo-red text-xs font-semibold text-white shadow-sm">
                {initials(data?.record?.title)}
              </div>
            )}
            <div className="min-w-0">
              {loading ? (
                <div className="h-5 w-56 bg-white/10 rounded animate-pulse" />
              ) : (
                <h2 className="flex items-center gap-2 text-base font-bold tracking-tight text-white">
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
                      pencil
                      className="min-w-0 truncate"
                      inputClassName="text-base font-bold tracking-tight bg-white/10 border-white/30 text-white focus:ring-white/50"
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
                <p className="truncate text-2xs leading-tight text-jubo-gold-soft/70">
                  {subline}
                  {phone ? <>{subline ? ' · ' : ''}<span className="tabular-nums text-white/80">{phone}</span></> : null}
                  {/* Tags inline on the compact strip — same derived chips. */}
                  {contactTags.map((t) => (
                    <span key={t.key} className="ml-1.5 rounded-full bg-white/10 px-1.5 py-px text-[9px] font-semibold text-white/85">
                      {t.label}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {phone && (
              <a
                href={`tel:${phone}`}
                title="Call"
                className="rounded-md bg-jubo-red p-1.5 text-white shadow-sm transition-colors hover:bg-jubo-red-dark"
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                title="Email"
                className="rounded-md border border-white/10 bg-jubo-navy2 p-1.5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Mail className="h-3.5 w-3.5" />
              </a>
            )}

            {data?.record?.board_id && (
              <button onClick={() => setShowMove(true)} title="Move to another board"
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
            )}
            {data?.record?.board_id && (
              <Link href={`/boards/${data.record.board_id}`} title="Open in board"
                className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
                <Maximize2 className="h-3.5 w-3.5" />
              </Link>
            )}
            <button onClick={onClose} title="Close (esc)"
              className="rounded-md p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Pipeline stage indicator (NOT tabs) — a slim navy strip. */}
        {data && (
          <div className="flex flex-shrink-0 justify-start border-b border-jubo-navy2 bg-jubo-navy px-4 pb-1.5 pt-0.5 sm:justify-center">
            <StageTracker groups={data.groups} currentGroupId={data.record.group_id ?? null} />
          </div>
        )}
    </>
  )

  return (
    // Phase C-LAYOUT — the record file is a CENTERED floating workspace over
    // a dimmed, blurred board. Click-outside still closes. Contact Card 2.0:
    // there is NO enclosing shell anymore — the three panels float directly
    // over the blurred app, which stays visible through the gaps between
    // them (the negative space is the real backdrop, not a desk surface).
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4">
      <div className="absolute inset-0 bg-jubo-navy/40 backdrop-blur-md" onClick={onClose} />
      <div className="relative h-[min(940px,calc(100vh-32px))] w-full max-w-[104rem]">
        {showMove && data?.record?.board_id && (
          <MoveToBoardDialog
            recordIds={[recordId]}
            currentBoardId={data.record.board_id}
            onClose={() => setShowMove(false)}
            onMoved={() => { setShowMove(false); load(); router.refresh() }}
          />
        )}

        {loading && !data ? (
          <div className="mx-auto flex h-full min-h-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-2xl">
            {headerSlot}
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-8 bg-surface-1 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          </div>
        ) : (
          <PersonFileCard recordId={recordId} onRequestClose={onClose} headerSlot={headerSlot} />
        )}
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
