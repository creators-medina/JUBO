'use client'

// ─────────────────────────────────────────────────────────────────────────
// UnifiedTimeline (Phase 10.3) — the center "borrower story": one chronological
// stream (calls / SMS / emails / meetings / notes / tasks / stage moves / other
// activity) with filter chips and a composer launcher. A high-signal PREVIEW —
// the full Activity and Communicate tabs remain the complete history.
//
// Pure presentation: merges data WorkspacePanel ALREADY loads (the synthesized
// timeline + communication_logs + notes), client-side only. No new queries, no
// new comm/notes/tasks systems, no engine changes. Rendering reuses the existing
// ActivityTimeline; the composer launcher routes to existing composers.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Activity as ActivityIcon, ChevronRight, MessageSquare, Mail, StickyNote, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ActivityTimeline } from '../timeline/ActivityTimeline'
import type { TimelineItem, NoteRow } from '../types'

const COMM_TYPES = new Set(['call', 'email', 'sms', 'meeting'])

type Filter = 'all' | 'comms' | 'tasks' | 'pipeline' | 'notes'
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'comms', label: 'Comms' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'notes', label: 'Notes' },
]

type ComposeKind = 'sms' | 'email' | 'note' | 'task'
const COMPOSE: { kind: ComposeKind; label: string; icon: React.ElementType }[] = [
  { kind: 'sms', label: 'SMS', icon: MessageSquare },
  { kind: 'email', label: 'Email', icon: Mail },
  { kind: 'note', label: 'Note', icon: StickyNote },
  { kind: 'task', label: 'Task', icon: ListChecks },
]

export function UnifiedTimeline({
  timeline, communications, notes, profiles, name, onCompose, onFullHistory,
}: {
  timeline: TimelineItem[]
  communications: any[]
  notes: NoteRow[]
  profiles: Record<string, string>
  name?: string | null
  onCompose: (kind: ComposeKind) => void
  onFullHistory: () => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  // Merge authoritative per-type sources (dedup-safe): drop comm/note rows from
  // the activity-sourced timeline, then add them from communication_logs + notes.
  const items = useMemo<TimelineItem[]>(() => {
    const base = timeline.filter((t) => !COMM_TYPES.has(t.activity_type) && t.activity_type !== 'note')
    const comms = (communications ?? [])
      .filter((c) => COMM_TYPES.has(c.channel))
      .map((c) => ({
        id: `c-${c.id}`, type: 'activity', activity_type: c.channel,
        timestamp: c.occurred_at, actor_id: c.created_by ?? null,
        actor_name: c.created_by ? (profiles[c.created_by] ?? null) : null,
        content: c.summary ?? c.subject ?? c.body ?? null,
        metadata: { direction: c.direction, outcome: c.outcome, follow_up_at: c.follow_up_at },
      }))
    const noteItems = (notes ?? []).map((n) => ({
      id: `n-${n.id}`, type: 'note', activity_type: 'note',
      timestamp: n.created_at, actor_id: n.author_user_id ?? null,
      actor_name: n.author_user_id ? (profiles[n.author_user_id] ?? null) : null,
      content: n.content ?? null,
    }))
    return [...base, ...comms, ...noteItems].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) as TimelineItem[]
  }, [timeline, communications, notes, profiles])

  const filtered = useMemo(() => items.filter((it) => {
    switch (filter) {
      case 'comms': return COMM_TYPES.has(it.activity_type)
      case 'tasks': return it.type === 'task'
      case 'pipeline': return it.type === 'movement' || it.activity_type === 'movement' || it.activity_type === 'status_change'
      case 'notes': return it.type === 'note'
      default: return true
    }
  }), [items, filter])

  return (
    <section className="jubo-los-card flex flex-col p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <ActivityIcon className="h-3.5 w-3.5 text-jubo-gold" />
        <p className="jubo-los-section-label">Activity</p>
        <button
          type="button"
          onClick={onFullHistory}
          className="ml-auto -my-0.5 inline-flex items-center gap-0.5 rounded py-0.5 text-2xs font-medium text-jubo-text-soft transition-colors hover:text-jubo-text"
        >
          Full history <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Filters — wrap/scroll cleanly on mobile. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'rounded-full px-2.5 py-1 text-2xs font-medium transition-colors',
              filter === f.key
                ? 'bg-jubo-navy text-white'
                : 'bg-jubo-card-soft text-jubo-text-soft hover:text-jubo-text',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ActivityTimeline items={filtered} emptyHint="Nothing here yet." variant="los" />

      {/* Composer launcher — opens existing composers (no new send logic). */}
      <div className="mt-3 border-t border-jubo-border pt-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {COMPOSE.map((c) => {
            const Icon = c.icon
            return (
              <button
                key={c.kind}
                type="button"
                onClick={() => onCompose(c.kind)}
                className="inline-flex items-center gap-1 rounded-lg border border-jubo-border bg-jubo-card px-2.5 py-1 text-2xs font-medium text-jubo-text transition-colors hover:border-jubo-border-strong hover:bg-jubo-card-soft"
              >
                <Icon className="h-3 w-3" /> {c.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => onCompose('sms')}
          className="w-full rounded-lg border border-jubo-border bg-jubo-card px-3 py-2 text-left text-xs text-jubo-text-soft transition-colors hover:border-jubo-border-strong"
        >
          Message{name ? ` ${name}` : ''}…
        </button>
      </div>
    </section>
  )
}
