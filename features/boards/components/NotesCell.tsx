'use client'

// Phase 35A — compact board cell for the notes column. Never renders note
// bodies; shows a count + last activity and opens the existing WorkspacePanel
// notes tab on click. Subtle color state for fast scanning:
//   gray = none · blue = has notes · amber = updated in the last 24h.

import { StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import type { NotesSummary } from '@/features/workspace/notes/queries'

export function NotesCell({ summary, onOpen }: { summary?: NotesSummary; onOpen: () => void }) {
  const count = summary?.count ?? 0
  const tone = count === 0 ? 'text-muted-foreground/70' : summary?.recent ? 'text-amber-400' : 'text-blue-400'

  return (
    <button
      type="button"
      onClick={onOpen}
      title={count === 0 ? 'Add notes' : `${count} note${count === 1 ? '' : 's'} — open notes`}
      className="flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
    >
      <StickyNote className={cn('h-3.5 w-3.5 flex-shrink-0', tone)} />
      {count === 0 ? (
        <span className="text-2xs text-muted-foreground">No notes</span>
      ) : (
        <span className="min-w-0">
          <span className="block text-2xs font-medium text-foreground leading-tight">
            {count} note{count === 1 ? '' : 's'}
          </span>
          <span className="block truncate text-[10px] leading-tight text-muted-foreground">
            {summary?.lastAuthorName ? `${summary.lastAuthorName} · ` : ''}
            {summary?.lastUpdatedAt ? formatDistanceToNow(summary.lastUpdatedAt) : ''}
          </span>
        </span>
      )}
    </button>
  )
}
