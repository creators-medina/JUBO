'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { updateBoard, archiveBoard, updateBoardDefaultView } from '@/features/boards/actions'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#64748b', '#0ea5e9', '#f97316']

interface Props {
  open: boolean
  onClose: () => void
  board: any
}

export function BoardSettingsModal({ open, onClose, board }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState(board.name ?? '')
  const [description, setDescription] = useState(board.description ?? '')
  const [color, setColor] = useState(board.color ?? '')
  // Lead-inbox pass — the board's default view for users with no saved view
  // preference (their own last-used view always wins over this).
  const initialDefaultView: 'kanban' | 'table' =
    (board.display_settings?.default_view === 'table' ? 'table' : 'kanban')
  const [defaultView, setDefaultView] = useState<'kanban' | 'table'>(initialDefaultView)
  const [error, setError] = useState<string | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [isArchiving, startArchive] = useTransition()

  const handleArchive = () => {
    setError(null)
    startArchive(async () => {
      try {
        await archiveBoard(board.id)
        onClose()
        router.push('/boards')
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Could not archive board')
      }
    })
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    startTransition(async () => {
      try {
        await updateBoard(board.id, { name: name.trim(), description: description.trim() || undefined, color: color || undefined })
        // Merge-writes ONLY the default_view key inside display_settings;
        // the summary display prefs sharing the column are untouched.
        if (defaultView !== initialDefaultView) {
          await updateBoardDefaultView(board.id, defaultView)
        }
        onClose()
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Board settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Color</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setColor('')}
                className={`w-6 h-6 rounded-full border-2 transition-transform bg-surface-2 ${!color ? 'border-jubo-navy scale-110' : 'border-transparent'}`}
              />
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${color === c ? 'border-jubo-navy scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Default view</label>
            <div className="flex gap-1.5">
              {(['kanban', 'table'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDefaultView(v)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${defaultView === v ? 'border-jubo-navy bg-jubo-navy text-white' : 'border-border bg-surface-1 text-foreground hover:bg-surface-2'}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">How this board opens for anyone who hasn&apos;t picked a view yet — each person&apos;s own last-used view always wins.</p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-between items-center pt-1">
            {confirmArchive ? null : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive text-xs"
                onClick={() => setConfirmArchive(true)}
              >
                Archive board
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </form>

        {confirmArchive && (
          <div className="mt-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-2.5">
            <p className="text-xs text-foreground">
              Archive this board? Records and data will be preserved, but the board will be hidden.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmArchive(false)} disabled={isArchiving}>
                Keep board
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleArchive}
                disabled={isArchiving}
              >
                {isArchiving ? 'Archiving…' : 'Archive board'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
