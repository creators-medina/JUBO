'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Archive } from 'lucide-react'
import { updateDashboard, archiveDashboard } from '../actions'
import type { DashboardRow } from '@/features/widgets/types'

const COLOR_OPTIONS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#8b5cf6', label: 'Violet' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f97316', label: 'Orange' },
  { value: '#eab308', label: 'Yellow' },
  { value: '#22c55e', label: 'Green' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#0ea5e9', label: 'Sky' },
]

const ICON_OPTIONS = ['📊', '📈', '🎯', '🚀', '⚡', '🔥', '💡', '🏆', '📋', '🗂️', '✅', '🌟']

interface DashboardSettingsModalProps {
  dashboard: DashboardRow
  onClose: () => void
}

export function DashboardSettingsModal({ dashboard, onClose }: DashboardSettingsModalProps) {
  const router = useRouter()
  const [name, setName] = useState(dashboard.name)
  const [description, setDescription] = useState(dashboard.description ?? '')
  const [icon, setIcon] = useState(dashboard.icon ?? '')
  const [color, setColor] = useState(dashboard.color ?? '')
  const [error, setError] = useState('')
  const [archiveError, setArchiveError] = useState('')
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isArchiving, startArchiveTransition] = useTransition()

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    setError('')
    startTransition(async () => {
      try {
        await updateDashboard(dashboard.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          icon: icon || undefined,
          color: color || undefined,
        })
        router.refresh()
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save')
      }
    })
  }

  const handleArchive = () => {
    setArchiveError('')
    startArchiveTransition(async () => {
      try {
        await archiveDashboard(dashboard.id)
        router.push('/dashboard')
      } catch (err) {
        setArchiveError(err instanceof Error ? err.message : 'Failed to archive')
        setShowArchiveConfirm(false)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-jubo-navy/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Dashboard Settings</h2>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Icon</label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setIcon('')}
                className={`w-8 h-8 rounded-lg border text-xs transition-colors ${!icon ? 'bg-jubo-navy/10 border-jubo-navy' : 'border-border text-muted-foreground hover:border-border/80'}`}
              >
                —
              </button>
              {ICON_OPTIONS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setIcon(emoji)}
                  className={`w-8 h-8 rounded-lg border text-base transition-colors ${icon === emoji ? 'bg-jubo-navy/10 border-jubo-navy' : 'border-border hover:border-border/80'}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Accent color</label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setColor('')}
                className={`w-6 h-6 rounded-full border-2 bg-muted transition-colors ${!color ? 'border-jubo-navy' : 'border-transparent hover:border-border'}`}
                title="None"
              />
              {COLOR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColor(opt.value)}
                  style={{ backgroundColor: opt.value }}
                  className={`w-6 h-6 rounded-full border-2 transition-colors ${color === opt.value ? 'border-white' : 'border-transparent hover:border-white/50'}`}
                  title={opt.label}
                />
              ))}
            </div>
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
              {isPending ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>

        <div className="px-5 pb-5 border-t border-border pt-4">
          {archiveError && <p className="text-xs text-jubo-red mb-3">{archiveError}</p>}
          {showArchiveConfirm ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Archive <strong className="text-foreground">{dashboard.name}</strong>? It will be hidden from the sidebar but not deleted.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowArchiveConfirm(false)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleArchive}
                  disabled={isArchiving}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-jubo-red/10 border border-jubo-red/30 text-xs text-jubo-red hover:bg-jubo-red/20 disabled:opacity-50 transition-colors"
                >
                  {isArchiving ? 'Archiving…' : 'Archive dashboard'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowArchiveConfirm(true)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-jubo-red transition-colors"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
