'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createBoard } from '@/features/boards/actions'
import type { BoardType } from '@/types/database'

const BOARD_TYPES: { value: BoardType; label: string }[] = [
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'crm', label: 'CRM' },
  { value: 'operations', label: 'Operations' },
  { value: 'recruiting', label: 'Recruiting' },
  { value: 'custom', label: 'Custom' },
]

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

interface Props {
  open: boolean
  onClose: () => void
  organizationId: string
}

export function CreateBoardModal({ open, onClose, organizationId }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [boardType, setBoardType] = useState<BoardType>('pipeline')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        await createBoard({
          organization_id: organizationId,
          name: name.trim(),
          slug: slugify(name),
          description: description.trim() || undefined,
          board_type: boardType,
        })
        setName('')
        setDescription('')
        onClose()
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Create board</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Board name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Loan Pipeline"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Type</label>
            <div className="flex flex-wrap gap-2">
              {BOARD_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setBoardType(t.value)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    boardType === t.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-surface-2 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Description <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              placeholder="What is this board for?"
              rows={2}
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
              {isPending ? 'Creating…' : 'Create board'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
