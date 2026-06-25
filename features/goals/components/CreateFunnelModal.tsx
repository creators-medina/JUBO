'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Trash2 } from 'lucide-react'
import { createFunnel, createFunnelStage } from '../actions'

type StageDraft = { name: string; slug: string; board_group_id: string | null }

interface CreateFunnelModalProps {
  organizationId: string
  boards: Array<{ id: string; name: string }>
  boardGroupsByBoard: Record<string, Array<{ id: string; name: string; board_id: string }>>
  onClose: () => void
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'stage'
}

export function CreateFunnelModal({ organizationId, boards, boardGroupsByBoard, onClose }: CreateFunnelModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [stages, setStages] = useState<StageDraft[]>([{ name: '', slug: '', board_group_id: null }])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const allGroups = boards.flatMap(b => (boardGroupsByBoard[b.id] ?? []).map(g => ({ ...g, board_name: b.name })))

  const handleStageNameChange = (idx: number, value: string) => {
    setStages(prev => prev.map((s, i) => i === idx ? { ...s, name: value, slug: s.slug || slugify(value) } : s))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Funnel name is required'); return }
    const validStages = stages.filter(s => s.name.trim())
    if (validStages.length < 2) { setError('Add at least 2 stages'); return }
    setError('')

    startTransition(async () => {
      try {
        const funnelId = await createFunnel({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
        })
        // Create stages in declared order
        for (let i = 0; i < validStages.length; i++) {
          const s = validStages[i]
          await createFunnelStage({
            funnel_id: funnelId,
            name: s.name.trim(),
            slug: s.slug.trim() || slugify(s.name),
            stage_order: i,
            board_group_id: s.board_group_id,
          })
        }
        router.refresh()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create funnel')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Funnel</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Mortgage funnel, SDR funnel, Realtor funnel"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Stages (ordered)</label>
              <button
                type="button"
                onClick={() => setStages(prev => [...prev, { name: '', slug: '', board_group_id: null }])}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-3 h-3" />
                Add stage
              </button>
            </div>

            <div className="space-y-2">
              {stages.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-2xs text-muted-foreground w-5 text-right tabular-nums">{i + 1}.</span>
                  <input
                    type="text"
                    value={s.name}
                    onChange={e => handleStageNameChange(i, e.target.value)}
                    placeholder="Stage name"
                    className="flex-1 px-2 py-1.5 rounded-md bg-surface-1 border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={s.board_group_id ?? ''}
                    onChange={e => setStages(prev => prev.map((x, j) => j === i ? { ...x, board_group_id: e.target.value || null } : x))}
                    className="w-44 px-2 py-1.5 rounded-md bg-surface-1 border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">No board group</option>
                    {allGroups.map(g => (
                      <option key={g.id} value={g.id}>{g.board_name} · {g.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setStages(prev => prev.filter((_, j) => j !== i))}
                    className="p-1 rounded text-muted-foreground hover:text-jubo-red"
                    title="Remove stage"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-2xs text-muted-foreground">
              Mapping a stage to a board group is optional — it&apos;s how current performance gets counted.
            </p>
          </div>

          {error && <p className="text-xs text-jubo-red">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating…' : 'Create funnel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
