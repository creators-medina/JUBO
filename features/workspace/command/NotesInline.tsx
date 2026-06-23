'use client'

// ─────────────────────────────────────────────────────────────────────────
// NotesInline (Command Center · Phase 5) — Notes as a first-class Overview band.
// Surfaces a summary (count · last author · recency), a quick-add composer, and
// the most recent notes, with "View all →" routing to the existing Notes tab.
//
// Pure presentation/composition: reuses the existing NoteList (composer + items
// + createNote/updateNote/deleteNote actions). No new notes system, no drawer,
// no AI, no pinned/search. No schema/RPC/migration changes.
// ─────────────────────────────────────────────────────────────────────────

import { StickyNote, ChevronRight } from 'lucide-react'
import { formatRelativeTime } from '@/features/boards/components/KanbanCardFace'
import { NoteList } from '../notes/NoteList'
import type { NoteRow } from '../types'

const RECENT_LIMIT = 3

export function NotesInline({
  organizationId, recordId, notes, currentUserId, profiles, onViewAll, onChanged,
}: {
  organizationId: string
  recordId: string
  notes: NoteRow[]
  currentUserId: string | null
  profiles: Record<string, string>
  onViewAll: () => void
  onChanged: () => void
}) {
  const count = notes.length
  const last = notes[0] // loader returns newest-first
  const lastAuthor = last ? (profiles[last.author_user_id ?? ''] ?? 'Someone') : null
  const isRecent = last ? Date.now() - new Date(last.created_at).getTime() < 86_400_000 : false

  return (
    <section className="premium-card rounded-xl p-3">
      <div className="mb-2 flex items-center gap-2">
        <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
        {count > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-surface-2 px-1 text-2xs font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
        {count > RECENT_LIMIT && (
          <button
            type="button"
            onClick={onViewAll}
            className="ml-auto inline-flex items-center gap-0.5 rounded text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View all <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {count > 0 && lastAuthor && (
        <p className="mb-2 flex items-center gap-1.5 text-2xs text-muted-foreground">
          {isRecent && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: 'var(--accent-amber)' }} aria-hidden />}
          Last by <span className="text-foreground">{lastAuthor}</span> · {formatRelativeTime(last.created_at) || 'just now'}
        </p>
      )}

      {/* Reused composer + items; recent only — "View all" covers the rest. */}
      <NoteList
        organizationId={organizationId}
        recordId={recordId}
        notes={notes.slice(0, RECENT_LIMIT)}
        currentUserId={currentUserId}
        onChanged={onChanged}
      />
    </section>
  )
}
