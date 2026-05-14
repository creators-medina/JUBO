'use client'

import { useState, useTransition } from 'react'
import { X, BarChart2, List, LayoutGrid, Check } from 'lucide-react'
import { addWidget } from '../actions'
import { WIDGET_META } from '@/features/widgets/registry'
import { defaultConfig, WIDGET_ICON_NAMES, WIDGET_COLORS } from '@/features/widgets/types'
import type { WidgetType } from '@/types/database'
import type { MetricWidgetConfig, ListWidgetConfig, BoardSummaryWidgetConfig } from '@/features/widgets/types'

const TYPE_ICONS: Record<WidgetType, React.ElementType> = {
  metric:        BarChart2,
  list:          List,
  board_summary: LayoutGrid,
}

const WIDTH_OPTIONS = [
  { value: 1, label: '¼ width' },
  { value: 2, label: '½ width' },
  { value: 3, label: '¾ width' },
  { value: 4, label: 'Full width' },
]

const SORT_OPTIONS = [
  { value: 'updated_at', label: 'Recently updated' },
  { value: 'created_at', label: 'Date created' },
  { value: 'title',      label: 'Title A→Z' },
  { value: 'value',      label: 'Value (high→low)' },
  { value: 'priority',   label: 'Priority' },
]

interface Board { id: string; name: string }

interface AddWidgetModalProps {
  dashboardId: string
  boards: Board[]
  onClose: () => void
  onSuccess: () => void
}

export function AddWidgetModal({ dashboardId, boards, onClose, onSuccess }: AddWidgetModalProps) {
  const [step, setStep] = useState<'type' | 'config'>('type')
  const [selectedType, setSelectedType] = useState<WidgetType | null>(null)
  const [title, setTitle] = useState('')
  const [width, setWidth] = useState(2)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSelectType = (type: WidgetType) => {
    setSelectedType(type)
    setTitle(WIDGET_META[type].label)
    setWidth(WIDGET_META[type].defaultWidth)
    setConfig(defaultConfig(type) as unknown as Record<string, unknown>)
    setStep('config')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    if (!selectedType) { setError('Select a widget type'); return }
    setError('')

    startTransition(async () => {
      try {
        await addWidget({
          dashboard_id: dashboardId,
          widget_type: selectedType,
          title: title.trim(),
          width,
          config,
        })
        onSuccess()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add widget')
      }
    })
  }

  const setConfigField = (key: string, value: unknown) => {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step === 'config' && (
              <button
                onClick={() => setStep('type')}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ← Back
              </button>
            )}
            <h2 className="text-sm font-semibold text-foreground">
              {step === 'type' ? 'Add Widget' : `Configure ${selectedType ? WIDGET_META[selectedType].label : ''}`}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 1: Type selector */}
        {step === 'type' && (
          <div className="p-5 grid grid-cols-1 gap-3">
            {(Object.keys(WIDGET_META) as WidgetType[]).map(type => {
              const meta = WIDGET_META[type]
              const Icon = TYPE_ICONS[type]
              return (
                <button
                  key={type}
                  onClick={() => handleSelectType(type)}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-surface-1 text-left transition-all group"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    <Icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{meta.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Step 2: Config */}
        {step === 'config' && selectedType && (
          <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Title */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Title *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>

            {/* Width */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Width</label>
              <div className="grid grid-cols-4 gap-2">
                {WIDTH_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWidth(opt.value)}
                    className={`px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                      width === opt.value
                        ? 'bg-primary/20 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Source board */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Source Board {selectedType !== 'metric' ? '*' : '(optional)'}
              </label>
              <select
                value={(config.board_id as string) ?? ''}
                onChange={e => setConfigField('board_id', e.target.value || null)}
                className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All boards</option>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            {/* Metric-specific: aggregation */}
            {selectedType === 'metric' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Measure</label>
                  <div className="flex gap-2">
                    {(['count', 'sum'] as const).map(agg => (
                      <button
                        key={agg}
                        type="button"
                        onClick={() => setConfigField('aggregation', agg)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-colors ${
                          (config as MetricWidgetConfig).aggregation === agg
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {agg === 'count' ? 'Count records' : 'Sum values ($)'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Icon</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WIDGET_ICON_NAMES.map(ic => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setConfigField('icon', ic)}
                        className={`px-2 py-1 rounded text-xs border transition-colors ${
                          (config as MetricWidgetConfig).icon === ic
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Color</label>
                  <div className="flex gap-2">
                    {(Object.keys(WIDGET_COLORS) as Array<keyof typeof WIDGET_COLORS>).map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setConfigField('color', c)}
                        title={c}
                        className={`px-3 py-1.5 rounded-lg border text-xs capitalize transition-colors ${
                          (config as MetricWidgetConfig).color === c
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* List-specific */}
            {selectedType === 'list' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Sort by</label>
                  <select
                    value={(config as ListWidgetConfig).sort_field ?? 'updated_at'}
                    onChange={e => setConfigField('sort_field', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Max records</label>
                  <select
                    value={(config as ListWidgetConfig).max_records ?? 10}
                    onChange={e => setConfigField('max_records', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {[5, 10, 15, 20].map(n => <option key={n} value={n}>{n} records</option>)}
                  </select>
                </div>
              </>
            )}

            {/* Board Summary-specific */}
            {selectedType === 'board_summary' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Group by</label>
                <div className="flex gap-2">
                  {(['group', 'status', 'priority'] as const).map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setConfigField('group_by', g)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
                        (config as BoardSummaryWidgetConfig).group_by === g
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-400">{error}</p>}

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
                {isPending ? 'Adding…' : 'Add Widget'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
