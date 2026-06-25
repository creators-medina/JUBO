'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Maximize2, ArrowRightLeft, Phone } from 'lucide-react'
import { MoveToBoardDialog } from '@/features/boards/components/MoveToBoardDialog'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTabs } from '../providers/WorkspaceTabsProvider'
import { PersonFileCard } from '@/features/person-card/PersonFileCard'
import { useWorkspaceKeyboard } from '../hooks/useWorkspaceKeyboard'
import { resolveWorkspaceTemplate } from '@/features/mortgage/templates/resolve'
import { getContactHealth } from '@/features/communications/metrics'
import type { ContactHealth } from '@/features/communications/types'
import type { NoteRow } from '../types'

// Shared shape for the loaded record bundle. Kept exported because the parked
// LOS Command-Center (features/workspace/command/LosCommandCenter.tsx) types
// against it for the Phase C3 harvest.
export type Loaded = {
  record: any
  board: any
  communications: any[]
  fields: any[]
  fieldValues: any[]
  activities: any[]
  tasks: any[]
  movements: any[]
  notes: NoteRow[]
  groups: any[]
  profiles: Record<string, string>
  currentUserId: string | null
}

export function WorkspacePanel() {
  const { tabs, activeRecordId, closeWorkspace, cycleSubTab, closeAll } = useWorkspaceTabs()
  const activeTab = tabs.find(t => t.recordId === activeRecordId) ?? null

  // Keyboard: Esc closes, Cmd+Shift+[ / ] cycles sub-tabs
  useWorkspaceKeyboard({
    enabled: !!activeRecordId,
    onClose: closeAll,
    onCycle: cycleSubTab,
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

      // Resolve actor names from activities + tasks + notes + movements
      const userIds = new Set<string>()
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

  useEffect(() => { load() }, [load])

  // Refetch when the page revalidates
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const contactHealth: ContactHealth = data ? getContactHealth(data.communications) : 'unknown'

  // Header identity bits (role label + phone) from loaded data only.
  const roleLabel = data ? (resolveWorkspaceTemplate(data as any)?.label ?? '') : ''
  const phone = useMemo(() => {
    if (!data) return null
    const f = data.fields.find((x: any) => x.slug === 'phone')
    if (!f) return null
    return data.fieldValues.find((v: any) => v.field_id === f.id)?.value_text ?? null
  }, [data])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-[min(72rem,92vw)] bg-background border-l border-border flex flex-col h-full shadow-2xl">
        {/* Window chrome — borrower identity (left) + panel controls (right). The
            record's four-tab File Card (Overview / Loan & Property / Borrower /
            Financial) is the entire body below. */}
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-jubo-navy2 bg-jubo-navy flex-shrink-0">
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
                  <span className="truncate">{data?.record?.title ?? 'Record'}</span>
                </h2>
              )}
              {data && (
                <p className="mt-0.5 truncate text-2xs text-jubo-gold-soft/70">
                  {roleLabel}{phone ? <> · <span className="tabular-nums text-white/80">{phone}</span></> : null}
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

        {showMove && data?.record?.board_id && (
          <MoveToBoardDialog
            recordIds={[recordId]}
            currentBoardId={data.record.board_id}
            onClose={() => setShowMove(false)}
            onMoved={() => { setShowMove(false); load(); router.refresh() }}
          />
        )}

        {/* Body — the four-tab File Card owns its own header + tab strip. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          {loading && !data ? (
            <div className="space-y-3">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-8 bg-surface-1 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : (
            <PersonFileCard recordId={recordId} />
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
