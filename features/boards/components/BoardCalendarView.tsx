'use client'

// ─────────────────────────────────────────────────────────────────────────
// Calendar View (Phase F) — READ-ONLY third board view. Places the board's
// already-filtered records on a month grid by a user-chosen date source (any
// date/datetime field, or the record's Next-action-due date). Zero new queries
// (same data the other views get); NO drag, NO writes, NO DnD participation.
// Clicking a record opens its workspace, exactly like Table/Kanban.
//
// Timezone handling (important): next_action_due_at and datetime fields are real
// timestamps → bucket by LOCAL date parts so an 11pm-local time lands on the
// right day (not the next UTC day). date-only fields are stored at UTC-midnight
// and rendered elsewhere via value_date.split('T')[0], so we take the stored
// calendar date as-is (no shift) to stay consistent with the rest of the app.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { type Stage } from './BoardKanbanView'
import { stageColor } from './BoardStageSummary'
import { cn } from '@/lib/utils'

type CalRecord = { id: string; title: string; group_id: string | null; next_action_due_at: string | null }
type CalField = { id: string; name: string; field_type: string }
type FvRow = { value_date?: string | null }

interface Props {
  records: CalRecord[]           // flat, filtered, top-level (accepts the board's any-typed records)
  stages: Stage[]
  fields: CalField[]             // localFields — used to find date/datetime fields
  fieldValuesIndex: Record<string, Record<string, FvRow | undefined>>
  onSelectRecord: (recordId: string, title: string) => void
}

type DateSource =
  | { id: '__next_action__'; name: string; kind: 'next_action' }
  | { id: string; name: string; kind: 'field'; fieldType: 'date' | 'datetime' }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')

/** Local-day key (YYYY-MM-DD) for a real timestamp — buckets by the viewer's
 *  local day so late-evening times don't roll onto the next UTC day. */
function localKey(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
/** Date-only field: keep the stored calendar date (no timezone shift). */
function calendarKey(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : localKey(iso)
}

export function BoardCalendarView({ records, stages, fields, fieldValuesIndex, onSelectRecord }: Props) {
  const dateSources = useMemo<DateSource[]>(() => {
    const fieldSources = (fields ?? [])
      .filter((f) => f.field_type === 'date' || f.field_type === 'datetime')
      .map((f) => ({ id: f.id, name: f.name, kind: 'field' as const, fieldType: f.field_type as 'date' | 'datetime' }))
    // Default to Next-action-due — it exists on every record and is the universal
    // operational lens; date fields (close date, etc.) are opt-in.
    return [{ id: '__next_action__', name: 'Next action due', kind: 'next_action' }, ...fieldSources]
  }, [fields])

  const [sourceId, setSourceId] = useState<string>('__next_action__')
  const source = dateSources.find((s) => s.id === sourceId) ?? dateSources[0]

  const today = new Date()
  const [view, setView] = useState<{ year: number; month: number }>({ year: today.getFullYear(), month: today.getMonth() })
  const [expanded, setExpanded] = useState<string | null>(null)   // day key whose full-list popover is open

  const colorByGroup = useMemo(() => new Map(stages.map((s, i) => [s.groupId, stageColor(s, i)])), [stages])
  const labelByGroup = useMemo(() => new Map(stages.map((s) => [s.groupId, s.label])), [stages])

  const { byDay, unscheduled } = useMemo(() => {
    const resolve = (rec: CalRecord): string | null => {
      if (source.kind === 'next_action') return rec.next_action_due_at ? localKey(rec.next_action_due_at) : null
      const val = fieldValuesIndex[rec.id]?.[source.id]?.value_date
      if (!val) return null
      return source.fieldType === 'date' ? calendarKey(val) : localKey(val)
    }
    const map = new Map<string, CalRecord[]>()
    const uns: CalRecord[] = []
    for (const r of records) {
      const k = resolve(r)
      if (!k) { uns.push(r); continue }
      const list = map.get(k)
      if (list) list.push(r); else map.set(k, [r])
    }
    return { byDay: map, unscheduled: uns }
  }, [records, source, fieldValuesIndex])

  // Month grid: 6 rows × 7 cols, starting on the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(view.year, view.month, 1)
    const start = new Date(view.year, view.month, 1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  }, [view])

  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`

  const goMonth = (delta: number) => setView((v) => {
    const m = v.month + delta
    return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 }
  })
  const goToday = () => setView({ year: today.getFullYear(), month: today.getMonth() })

  const Chip = ({ rec }: { rec: CalRecord }) => (
    <button
      type="button"
      onClick={() => onSelectRecord(rec.id, rec.title ?? 'Record')}
      className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] text-jubo-text hover:bg-jubo-card-soft"
      title={rec.title}
    >
      <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: colorByGroup.get(rec.group_id ?? '') ?? '#94a3b8' }} />
      <span className="truncate">{rec.title ?? 'Untitled'}</span>
    </button>
  )

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar — date source + month nav */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-jubo-text-soft">
          <CalendarDays className="h-3.5 w-3.5" />
          <span>By</span>
          <select
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="rounded-md border border-border bg-surface-1 px-2 py-1 text-xs text-foreground focus:outline-none focus:border-jubo-navy"
          >
            {dateSources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => goMonth(-1)} title="Previous month" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-jubo-text-soft hover:bg-jubo-card-soft"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" onClick={goToday} className="rounded-md border border-border px-2 py-1 text-xs text-jubo-text-soft hover:bg-jubo-card-soft">Today</button>
          <button type="button" onClick={() => goMonth(1)} title="Next month" className="flex h-7 w-7 items-center justify-center rounded-md border border-border text-jubo-text-soft hover:bg-jubo-card-soft"><ChevronRight className="h-4 w-4" /></button>
          <span className="ml-2 min-w-[8.5rem] text-sm font-semibold text-jubo-text">{MONTHS[view.month]} {view.year}</span>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7">
        {WEEKDAYS.map((w) => <div key={w} className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-jubo-text-soft">{w}</div>)}
      </div>

      {/* Month grid — 1px gaps over a bg-border parent draw the grid lines. */}
      <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
        {cells.map((d, i) => {
          const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
          const inMonth = d.getMonth() === view.month
          const dayRecords = byDay.get(key) ?? []
          const isToday = key === todayKey
          return (
            <div key={i} className={cn('min-h-[92px] bg-jubo-card p-1', !inMonth && 'bg-jubo-card-soft/60')}>
              <div className="mb-0.5 flex items-center justify-between px-0.5">
                <span className={cn('inline-flex h-5 min-w-[20px] items-center justify-center rounded-full text-[11px] tabular-nums', isToday ? 'bg-jubo-navy font-semibold text-white' : inMonth ? 'text-jubo-text' : 'text-jubo-text-soft/60')}>{d.getDate()}</span>
              </div>
              <div className="space-y-0.5">
                {dayRecords.slice(0, 3).map((r) => <Chip key={r.id} rec={r} />)}
                {dayRecords.length > 3 && (
                  <button type="button" onClick={() => setExpanded(key)} className="w-full rounded px-1 text-left text-[10px] font-medium text-jubo-navy hover:underline">
                    +{dayRecords.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unscheduled — records with no date for the chosen source. */}
      {unscheduled.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-border p-2">
          <p className="mb-1.5 px-1 text-2xs font-semibold uppercase tracking-wide text-jubo-text-soft">Unscheduled ({unscheduled.length})</p>
          <div className="flex flex-wrap gap-1">
            {unscheduled.map((r) => (
              <button key={r.id} type="button" onClick={() => onSelectRecord(r.id, r.title ?? 'Record')} title={r.title} className="inline-flex items-center gap-1 rounded-full border border-border bg-jubo-card px-2 py-0.5 text-[11px] text-jubo-text hover:bg-jubo-card-soft">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colorByGroup.get(r.group_id ?? '') ?? '#94a3b8' }} />
                <span className="max-w-[12rem] truncate">{r.title ?? 'Untitled'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* "+N more" — full list for one day (no clipping; clickable rows). */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setExpanded(null)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-xl border border-border bg-jubo-card p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-2 text-sm font-semibold text-jubo-text">{formatDayTitle(expanded)}</p>
            <div className="space-y-0.5">
              {(byDay.get(expanded) ?? []).map((r) => (
                <button key={r.id} type="button" onClick={() => { onSelectRecord(r.id, r.title ?? 'Record'); setExpanded(null) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-jubo-text hover:bg-jubo-card-soft">
                  <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: colorByGroup.get(r.group_id ?? '') ?? '#94a3b8' }} />
                  <span className="truncate">{r.title ?? 'Untitled'}</span>
                  <span className="ml-auto flex-shrink-0 truncate text-2xs text-jubo-text-soft">{labelByGroup.get(r.group_id ?? '') ?? ''}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function formatDayTitle(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1)
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
