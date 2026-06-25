'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createDashboard } from '../actions'

const ICONS = ['📊', '🎯', '⚡', '📈', '🏆', '🔥', '💡', '🚀']
const COLORS = [
  { value: 'blue',   label: 'Blue',   dot: 'bg-blue-500' },
  { value: 'green',  label: 'Green',  dot: 'bg-emerald-500' },
  { value: 'violet', label: 'Violet', dot: 'bg-violet-500' },
  { value: 'amber',  label: 'Amber',  dot: 'bg-amber-500' },
  { value: 'red',    label: 'Red',    dot: 'bg-red-500' },
]

interface CreateDashboardModalProps {
  organizationId: string
  onClose: () => void
  onSuccess: (dashboardId: string) => void
}

export function CreateDashboardModal({ organizationId, onClose, onSuccess }: CreateDashboardModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState('📊')
  const [color, setColor] = useState('blue')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')

    startTransition(async () => {
      try {
        const id = await createDashboard({
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || undefined,
          icon,
          color,
        })
        onSuccess(id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create dashboard')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-jubo-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Create Dashboard</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Sales Dashboard"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
            />
          </div>

          {/* Icon */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {ICONS.map(ic => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                    icon === ic ? 'bg-jubo-navy/10 ring-1 ring-jubo-navy' : 'bg-surface-1 hover:bg-surface-2'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Accent Color</label>
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  title={c.label}
                  className={`w-6 h-6 rounded-full ${c.dot} transition-all ${
                    color === c.value ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110' : 'opacity-60 hover:opacity-100'
                  }`}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-jubo-red">{error}</p>}

          {/* Footer */}
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
              disabled={isPending || !name.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating…' : 'Create Dashboard'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
