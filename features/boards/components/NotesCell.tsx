'use client'

// Phase 35A/35A.1 — compact board cell for the notes column. Never renders note
// bodies. Shows count + last activity, supports immediate quick-add (composer),
// and opens the full WorkspacePanel notes tab. All persistence goes through the
// existing createNote action (RPC + activity logging) — no second notes system.
//   gray = none · blue = has notes · amber = updated in the last 24h.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { StickyNote, Plus, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createNote } from '@/features/workspace/notes/actions'
import type { NotesSummary } from '@/features/workspace/notes/queries'

export function NotesCell({
  summary, recordId, organizationId, onOpen,
}: {
  summary?: NotesSummary
  recordId: string
  organizationId: string
  onOpen: () => void
}) {
  const router = useRouter()
  const [composer, setComposer] = useState(false)
  const [draft, setDraft] = useState('')
  const [pending, startTransition] = useTransition()

  const count = summary?.count ?? 0
  const tone = count === 0 ? 'text-muted-foreground/70' : summary?.recent ? 'text-amber-400' : 'text-blue-400'

  const save = () => {
    const body = draft.trim()
    if (!body) return
    startTransition(async () => {
      try {
        await createNote({ organization_id: organizationId, record_id: recordId, content: body })
        setDraft('')
        setComposer(false)
        router.refresh()   // refreshes the board summary → updated count/author
      } catch { /* keep composer open on failure */ }
    })
  }

  return (
    <>
      {count === 0 ? (
        // Empty cell → quick-add composer.
        <button
          type="button"
          onClick={() => setComposer(true)}
          title="Add a note"
          className="group/n flex w-full items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
        >
          <StickyNote className={cn('h-3.5 w-3.5 flex-shrink-0', tone)} />
          <span className="text-2xs text-muted-foreground">No notes</span>
          <Plus className="ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/n:opacity-100" />
        </button>
      ) : (
        // Has notes → summary opens full notes; "+" quick-adds.
        <div className="flex w-full items-center gap-1">
          <button
            type="button"
            onClick={onOpen}
            title={`${count} note${count === 1 ? '' : 's'} — open full notes`}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
          >
            <StickyNote className={cn('h-3.5 w-3.5 flex-shrink-0', tone)} />
            <span className="min-w-0">
              <span className="block text-2xs font-medium text-foreground leading-tight">{count} note{count === 1 ? '' : 's'}</span>
              <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                {summary?.lastAuthorName ? `${summary.lastAuthorName} · ` : ''}
                {summary?.lastUpdatedAt ? formatDistanceToNow(summary.lastUpdatedAt) : ''}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setComposer(true)}
            title="Add note"
            className="flex-shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Quick-add composer — portal Dialog (no table-overflow clipping; mobile-safe) */}
      <Dialog open={composer} onOpenChange={(o) => { if (!o) { setComposer(false); setDraft('') } }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold text-foreground">Add note</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save() }
                if (e.key === 'Escape') { setComposer(false); setDraft('') }
              }}
              placeholder="Add a note…"
              autoFocus
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-surface-1 px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center justify-between">
              {count > 0 ? (
                <button
                  type="button"
                  onClick={() => { setComposer(false); setDraft(''); onOpen() }}
                  className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                >
                  Open full notes <ArrowUpRight className="h-3 w-3" />
                </button>
              ) : <span className="text-2xs text-muted-foreground">⌘⏎ to save</span>}
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { setComposer(false); setDraft('') }}>Cancel</Button>
                <Button type="button" size="sm" onClick={save} disabled={pending || !draft.trim()}>
                  {pending ? 'Saving…' : 'Save Note'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
