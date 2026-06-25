'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save } from 'lucide-react'
import {
  createFunnelStage, updateFunnelStage, deleteFunnelStage,
} from '../actions'
import type { FunnelRow, FunnelStageRow } from '../types'

interface Board { id: string; name: string }
interface BoardGroup { id: string; name: string; board_id: string }

interface Props {
  funnel: FunnelRow
  stages: FunnelStageRow[]
  boards: Board[]
  boardGroupsByBoard: Record<string, BoardGroup[]>
  organizationId: string
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'stage'
}

export function FunnelStagesEditor({ funnel, stages, boards, boardGroupsByBoard }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const allGroups = boards.flatMap(b => (boardGroupsByBoard[b.id] ?? []).map(g => ({ ...g, board_name: b.name })))

  const [newName, setNewName] = useState('')

  const handleAdd = () => {
    if (!newName.trim()) return
    const order = stages.length
    startTransition(async () => {
      await createFunnelStage({
        funnel_id: funnel.id,
        name: newName.trim(),
        slug: slugify(newName),
        stage_order: order,
        stage_type: 'activity',
      })
      setNewName('')
      router.refresh()
    })
  }

  const handleUpdate = (id: string, updates: { name?: string; board_group_id?: string | null }) => {
    startTransition(async () => {
      await updateFunnelStage(id, updates)
      router.refresh()
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      await deleteFunnelStage(id)
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">{funnel.name}</h2>
        {funnel.description && <p className="text-xs text-muted-foreground mt-0.5">{funnel.description}</p>}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-4 py-3 border-b border-border">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">Stages — ordered top to bottom</p>
        </div>
        {stages.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground">No stages yet. Add one below.</p>
        ) : (
          <div className="divide-y divide-border">
            {stages.map((stage, i) => (
              <StageRow
                key={stage.id}
                index={i}
                stage={stage}
                allGroups={allGroups}
                onUpdate={updates => handleUpdate(stage.id, updates)}
                onDelete={() => handleDelete(stage.id)}
              />
            ))}
          </div>
        )}

        <div className="p-3 border-t border-border bg-surface-1/40">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="Add a new stage…"
              className="flex-1 px-3 py-1.5 rounded-md bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-3 h-3" /> Add stage
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StageRow({
  index, stage, allGroups, onUpdate, onDelete,
}: {
  index: number
  stage: FunnelStageRow
  allGroups: Array<{ id: string; name: string; board_id: string; board_name: string }>
  onUpdate: (updates: { name?: string; board_group_id?: string | null }) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(stage.name)
  const dirty = name !== stage.name

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-2xs text-muted-foreground w-5 tabular-nums">{index + 1}.</span>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={() => dirty && onUpdate({ name })}
        className="flex-1 px-2 py-1 rounded-md bg-transparent border border-transparent hover:border-border focus:border-ring focus:bg-surface-1 text-sm text-foreground focus:outline-none"
      />
      <select
        value={stage.board_group_id ?? ''}
        onChange={e => onUpdate({ board_group_id: e.target.value || null })}
        className="w-48 px-2 py-1 rounded-md bg-surface-1 border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">No board group</option>
        {allGroups.map(g => (
          <option key={g.id} value={g.id}>{g.board_name} · {g.name}</option>
        ))}
      </select>
      {dirty && (
        <button onClick={() => onUpdate({ name })} className="p-1 rounded text-primary hover:bg-primary/10" title="Save">
          <Save className="w-3 h-3" />
        </button>
      )}
      <button onClick={onDelete} className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10" title="Remove stage">
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  )
}
