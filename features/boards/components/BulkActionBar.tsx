'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Archive, Trash2, ArrowRight, X } from 'lucide-react'
import { bulkArchiveRecords, bulkDeleteRecords } from '@/features/records/actions'
import { useToast } from '@/features/feedback/ToastProvider'
import { MoveToBoardDialog } from './MoveToBoardDialog'
import { cn } from '@/lib/utils'

interface Props {
  selectedIds: string[]
  groups: { id: string; name: string }[]
  boardId: string
  onClear: () => void
}

/** Floating bottom action bar — appears when one or more board rows are
 * selected. MVP actions: move (to any board+group), archive, delete, clear.
 * Each action delegates to its bulk server action and refreshes the page. */
export function BulkActionBar({ selectedIds, boardId, onClear }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [showMove, setShowMove] = useState(false)
  const [isPending, startTransition] = useTransition()
  const count = selectedIds.length

  if (count === 0) return null

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
    <>
    {showMove && (
      <MoveToBoardDialog
        recordIds={selectedIds}
        currentBoardId={boardId}
        onClose={() => setShowMove(false)}
        onMoved={({ moved, failed }) => {
          setShowMove(false)
          toast[failed > 0 ? 'error' : 'success'](
            failed > 0 ? `Moved ${moved} · ${failed} failed` : `Moved ${moved} record${moved === 1 ? '' : 's'}`,
          )
          onClear()
          router.refresh()
        }}
      />
    )}
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="rounded-md bg-jubo-navy/15 px-2 py-1 text-xs font-semibold text-jubo-navy">
          {count} selected
        </span>

        {/* Move to any board + group */}
        <button
          onClick={() => setShowMove(true)}
          disabled={isPending}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-2 disabled:opacity-50"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          Move
        </button>

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
    </>
  )
}
