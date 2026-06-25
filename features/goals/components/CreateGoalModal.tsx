'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createProductionGoal } from '../actions'
import type { FunnelRow } from '../types'

interface CreateGoalModalProps {
  organizationId: string
  funnels: FunnelRow[]
  onClose: () => void
  onSuccess?: () => void
}

const TIMEFRAME_OPTIONS = [
  { value: 'weekly',    label: 'Weekly' },
  { value: 'monthly',   label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly',    label: 'Yearly' },
  { value: 'custom',    label: 'Custom' },
]

function todayISO(): string { return new Date().toISOString().slice(0, 10) }
function endOfYearISO(): string {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), 11, 31)).toISOString().slice(0, 10)
}

export function CreateGoalModal({ organizationId, funnels, onClose, onSuccess }: CreateGoalModalProps) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [funnelId, setFunnelId] = useState<string>(funnels[0]?.id ?? '')
  const [timeframe, setTimeframe] = useState('yearly')
  const [startDate, setStartDate] = useState(todayISO())
  const [endDate, setEndDate] = useState(endOfYearISO())
  const [targetUnits, setTargetUnits] = useState<string>('')
  const [targetVolume, setTargetVolume] = useState<string>('')
  const [targetRevenue, setTargetRevenue] = useState<string>('')
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Name is required'); return }
    if (!startDate || !endDate) { setError('Start and end dates are required'); return }
    if (new Date(startDate) >= new Date(endDate)) { setError('End date must be after start'); return }
    if (!targetUnits && !targetVolume && !targetRevenue) {
      setError('Set at least one target (units, volume, or revenue)')
      return
    }
    setError('')

    startTransition(async () => {
      try {
        await createProductionGoal({
          organization_id: organizationId,
          funnel_id: funnelId || null,
          name: name.trim(),
          timeframe,
          start_date: startDate,
          end_date: endDate,
          target_units:   targetUnits   ? Number(targetUnits)   : null,
          target_volume:  targetVolume  ? Number(targetVolume)  : null,
          target_revenue: targetRevenue ? Number(targetRevenue) : null,
        })
        if (onSuccess) onSuccess()
        else { router.refresh(); onClose() }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create goal')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-card border border-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">New Production Goal</h2>
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
              placeholder="e.g. 2026 Production, Q3 Team Goal"
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Funnel</label>
            <select
              value={funnelId}
              onChange={e => setFunnelId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No funnel (you can attach one later)</option>
              {funnels.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <p className="text-2xs text-muted-foreground">
              Required if you want to use pacing/gap widgets — the engine pulls stages and assumptions from the funnel.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Timeframe</label>
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {TIMEFRAME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Targets</p>
            <div className="space-y-2">
              <NumberInput label="Units (e.g. closings, deals)" value={targetUnits} onChange={setTargetUnits} />
              <NumberInput label="Volume ($)" value={targetVolume} onChange={setTargetVolume} />
              <NumberInput label="Revenue ($)" value={targetRevenue} onChange={setTargetRevenue} />
            </div>
          </div>

          {error && <p className="text-xs text-jubo-red">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
            >
              Cancel
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Creating…' : 'Create goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground w-44 flex-shrink-0">{label}</span>
      <input
        type="number"
        min="0"
        step="any"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="—"
        className="flex-1 px-2 py-1.5 rounded-md bg-surface-1 border border-border text-xs text-foreground tabular-nums placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}
