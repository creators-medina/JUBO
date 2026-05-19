'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, Trash2, X } from 'lucide-react'
import { SnoozeMenu } from './SnoozeMenu'
import {
  bulkCompleteDailyActions, bulkSnoozeDailyActions, bulkDeleteDailyActions,
} from '../actions'

interface Props {
  selectedIds: string[]
  anyCompleted: boolean
  onClear: () => void
}

export function BulkActionBar({ selectedIds, anyCompleted, onClear }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (selectedIds.length === 0) return null

  const run = (fn: () => Promise<void>) => {
    startTransition(async () => {
      try { await fn(); onClear(); router.refresh() } catch {}
    })
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card shadow-2xl">
      <span className="text-xs text-foreground font-medium tabular-nums">
        {selectedIds.length} selected
      </span>
      <span className="h-4 w-px bg-border" />

      <button
        onClick={() => run(() => bulkCompleteDailyActions(selectedIds, true))}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors"
      >
        <Check className="w-3 h-3" />
        Complete
      </button>

      {anyCompleted && (
        <button
          onClick={() => run(() => bulkCompleteDailyActions(selectedIds, false))}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface-1 border border-border text-xs text-foreground hover:bg-surface-2 disabled:opacity-50 transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Reopen
        </button>
      )}

      <SnoozeMenu
        label="Snooze"
        onPick={(date) => run(() => bulkSnoozeDailyActions(selectedIds, date))}
        buttonClassName="px-2.5 py-1.5 rounded-md bg-surface-1 border border-border text-xs text-foreground hover:bg-surface-2"
      />

      <button
        onClick={() => {
          if (!confirm(`Delete ${selectedIds.length} action${selectedIds.length === 1 ? '' : 's'}?`)) return
          run(() => bulkDeleteDailyActions(selectedIds))
        }}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500/15 border border-red-500/30 text-xs text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-colors"
      >
        <Trash2 className="w-3 h-3" />
      </button>

      <span className="h-4 w-px bg-border" />
      <button
        onClick={onClear}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2"
        title="Clear selection"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
