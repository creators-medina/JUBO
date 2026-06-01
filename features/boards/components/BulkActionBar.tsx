'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Archive, Trash2, ArrowRight, X } from 'lucide-react'
import { bulkMoveRecords, bulkArchiveRecords, bulkDeleteRecords } from '@/features/records/actions'
import { cn } from '@/lib/utils'

interface Props {
  selectedIds: string[]
  groups: { id: string; name: string }[]
  boardId: string
  onClear: () => void
}

/** Floating bottom action bar — appears when one or more board rows are
 * selected. MVP actions: move to group, archive, delete, clear. Each action
 * delegates to its bulk server action and refreshes the page. */
export function BulkActionBar({ selectedIds, groups, boardId, onClear }: Props) {
  const router = useRouter()
  const [showMove, setShowMove] = useState(false)
  const [isPending, startTransition] = useTransition()
  const count = selectedIds.length

  if (count === 0) return null

  const move = (toGroupId: string) => {
    setShowMove(false)
    startTransition(async () => {
      try {
        await bulkMoveRecords(selectedIds, toGroupId, boardId)
        onClear()
        router.refresh()
      } catch {
        router.refresh()
      }
    })
  }

  const archive = () => {
    if (!confirm(`Archive ${count} record${count === 1 ? '' : 's'}?`)) return
    startTransition(async () => {
      try {
        await bulkArchiveRecords(selectedIds, boardId)
        onClear()
        router.refresh()
      } catch {
        router.refresh()
      }
    })
  }

  const del = () => {
    if (!confirm(`Permanently delete ${count} record${count === 1 ? '' : 's'}? This cannot be undone.`)) return
    startTransition(async () => {
      try {
        await bulkDeleteRecords(selectedIds, boardId)
        onClear()
        router.refresh()
      } catch {
        router.refresh()
      }
    })
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-semibold text-primary">
          {count} selected
        </span>

        {/* Move to group */}
        <div className="relative">
          <button
            onClick={() => setShowMove((v) => !v)}
            disabled={isPending || groups.length === 0}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Move to group
          </button>
          {showMove && (
            <div className="absolute bottom-full left-0 mb-1 w-48 rounded-lg border border-border bg-card shadow-xl">
              <div className="max-h-60 overflow-y-auto py-1">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => move(g.id)}
                    className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-1"
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={archive}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          <Archive className="h-3.5 w-3.5" />
          Archive
        </button>

        <button
          onClick={del}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>

        <div className="mx-1 h-5 w-px bg-border" />

        <button
          onClick={onClear}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>

        {isPending && <Loader2 className={cn('h-3.5 w-3.5 animate-spin text-muted-foreground')} />}
      </div>
    </div>
  )
}
