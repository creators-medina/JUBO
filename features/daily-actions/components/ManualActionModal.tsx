'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createDailyAction } from '../actions'
import type { TaskPriority } from '@/types/database'

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']

interface Props {
  organizationId: string
  productionGoals: Array<{ id: string; name: string }>
  defaultDate: string
  onClose: () => void
}

export function ManualActionModal({ organizationId, productionGoals, defaultDate, onClose }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState(defaultDate)
  const [goalId, setGoalId] = useState<string>('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setError('')
    startTransition(async () => {
      try {
        await createDailyAction({
          organization_id: organizationId,
          title: title.trim(),
          description: description.trim() || undefined,
          priority,
          due_date: dueDate,
          production_goal_id: goalId || null,
          source: 'manual',
          action_type: 'general',
        })
        router.refresh()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create action')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Action</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Title *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Call John about preapproval"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Link to goal (optional)</label>
            <select
              value={goalId}
              onChange={e => setGoalId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">None</option>
              {productionGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating…' : 'Add action'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
