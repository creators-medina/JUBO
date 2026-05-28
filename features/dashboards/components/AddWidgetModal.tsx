'use client'

import { useState, useTransition } from 'react'
import { X, BarChart2, List, LayoutGrid, Activity, Bookmark, Target, Zap, AlertTriangle, Sunrise, ListChecks, PhoneCall, TrendingUp, Flame, CalendarClock, Radio } from 'lucide-react'
import { addWidget } from '../actions'
import { WIDGET_META } from '@/features/widgets/registry'
import { defaultConfig, WIDGET_ICON_NAMES, WIDGET_COLORS } from '@/features/widgets/types'
import type { WidgetType } from '@/types/database'
import type {
  MetricWidgetConfig, ListWidgetConfig, BoardSummaryWidgetConfig,
  ActivityFeedWidgetConfig, SavedViewRow,
  GoalProgressWidgetConfig, FunnelPaceWidgetConfig, GapAnalysisWidgetConfig,
} from '@/features/widgets/types'
import type { ProductionGoalRow } from '@/features/goals/types'

const TYPE_ICONS: Record<WidgetType, React.ElementType> = {
  metric:             BarChart2,
  list:               List,
  board_summary:      LayoutGrid,
  activity_feed:      Activity,
  saved_view:         Bookmark,
  goal_progress:      Target,
  funnel_pace:        Zap,
  gap_analysis:       AlertTriangle,
  today_summary:      Sunrise,
  daily_actions_list: ListChecks,
  prospecting_summary: PhoneCall,
  connection_rate:    TrendingUp,
  hot_leads:          Flame,
  followups_due:      CalendarClock,
  active_call_session: Radio,
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
  savedViews: SavedViewRow[]
  productionGoals: ProductionGoalRow[]
  onClose: () => void
  onSuccess: () => void
}

export function AddWidgetModal({ dashboardId, boards, savedViews, productionGoals, onClose, onSuccess }: AddWidgetModalProps) {
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

  const hasBoard = selectedType === 'metric' || selectedType === 'list' || selectedType === 'board_summary'

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

            {/* Source board — only for board-backed widgets */}
            {hasBoard && (
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
            )}

            {/* Metric-specific */}
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

            {/* Activity Feed-specific */}
            {selectedType === 'activity_feed' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Max items</label>
                <select
                  value={(config as ActivityFeedWidgetConfig).max_items ?? 10}
                  onChange={e => setConfigField('max_items', Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[5, 10, 20, 30].map(n => <option key={n} value={n}>{n} items</option>)}
                </select>
              </div>
            )}

            {/* Goal Progress-specific */}
            {selectedType === 'goal_progress' && (
              <>
                <GoalSelect value={(config.production_goal_id as string) ?? ''} onChange={v => setConfigField('production_goal_id', v || null)} goals={productionGoals} />
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Metric</label>
                  <div className="flex gap-2">
                    {(['units', 'volume', 'revenue'] as const).map(m => (
                      <button key={m} type="button" onClick={() => setConfigField('metric', m)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
                          (config as GoalProgressWidgetConfig).metric === m
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >{m}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Display</label>
                  <div className="flex gap-2">
                    {(['bar', 'radial', 'compact'] as const).map(d => (
                      <button key={d} type="button" onClick={() => setConfigField('display', d)}
                        className={`flex-1 px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
                          (config as GoalProgressWidgetConfig).display === d
                            ? 'bg-primary/20 border-primary text-primary'
                            : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >{d}</button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Funnel Pace-specific */}
            {selectedType === 'funnel_pace' && (
              <>
                <GoalSelect value={(config.production_goal_id as string) ?? ''} onChange={v => setConfigField('production_goal_id', v || null)} goals={productionGoals} />
                <CadenceSelect value={(config as FunnelPaceWidgetConfig).cadence ?? 'daily'} onChange={v => setConfigField('cadence', v)} />
              </>
            )}

            {/* Gap Analysis-specific */}
            {selectedType === 'gap_analysis' && (
              <>
                <GoalSelect value={(config.production_goal_id as string) ?? ''} onChange={v => setConfigField('production_goal_id', v || null)} goals={productionGoals} />
                <CadenceSelect value={(config as GapAnalysisWidgetConfig).cadence ?? 'weekly'} onChange={v => setConfigField('cadence', v)} />
              </>
            )}

            {/* Daily actions list config */}
            {selectedType === 'daily_actions_list' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Max items</label>
                  <select
                    value={(config.max_items as number) ?? 5}
                    onChange={e => setConfigField('max_items', Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {[3, 5, 8, 10, 15].map(n => <option key={n} value={n}>{n} actions</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!config.show_completed}
                      onChange={e => setConfigField('show_completed', e.target.checked)}
                      className="rounded border-border"
                    />
                    Include completed actions
                  </label>
                </div>
              </>
            )}

            {/* Prospecting list widgets — max items */}
            {(selectedType === 'hot_leads' || selectedType === 'followups_due') && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Max items</label>
                <select
                  value={(config.max_items as number) ?? (selectedType === 'hot_leads' ? 5 : 6)}
                  onChange={e => setConfigField('max_items', Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {[3, 5, 6, 8, 10].map(n => <option key={n} value={n}>{n} items</option>)}
                </select>
              </div>
            )}

            {/* Saved View-specific */}
            {selectedType === 'saved_view' && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Saved View</label>
                <select
                  value={(config.saved_view_id as string) ?? ''}
                  onChange={e => setConfigField('saved_view_id', e.target.value || null)}
                  className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select a saved view…</option>
                  {savedViews.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                {savedViews.length === 0 && (
                  <p className="text-xs text-muted-foreground">No saved views yet. Save a view from a board to use it here.</p>
                )}
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

function GoalSelect({ value, onChange, goals }: { value: string; onChange: (v: string) => void; goals: ProductionGoalRow[] }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Production Goal *</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      >
        <option value="">Select a goal…</option>
        {goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>
      {goals.length === 0 && (
        <p className="text-xs text-muted-foreground">No production goals yet. Create one in /goals first.</p>
      )}
    </div>
  )
}

function CadenceSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">Cadence</label>
      <div className="flex gap-2">
        {(['daily', 'weekly', 'monthly'] as const).map(c => (
          <button key={c} type="button" onClick={() => onChange(c)}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm capitalize transition-colors ${
              value === c
                ? 'bg-primary/20 border-primary text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >{c}</button>
        ))}
      </div>
    </div>
  )
}
