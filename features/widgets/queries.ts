import { createClient } from '@/lib/supabase/server'
import type {
  DashboardWidgetRow,
  MetricWidgetConfig,
  ListWidgetConfig,
  BoardSummaryWidgetConfig,
  MetricWidgetData,
  ListWidgetData,
  BoardSummaryData,
  BoardSummaryRow,
  WidgetData,
  WidgetFilter,
} from './types'

// ── Filter application helper ─────────────────────────────────────────────────

function applyFilters<T extends object>(
  query: any,
  filters: WidgetFilter[],
): any {
  for (const f of filters) {
    if (f.operator === 'eq')  query = query.eq(f.field, f.value)
    if (f.operator === 'neq') query = query.neq(f.field, f.value)
  }
  return query
}

// ── Metric widget ─────────────────────────────────────────────────────────────

export async function getMetricWidgetData(
  config: MetricWidgetConfig,
  orgId: string,
): Promise<MetricWidgetData> {
  const supabase = await createClient()

  if (config.aggregation === 'count') {
    let q = supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('is_archived', false)

    if (config.board_id) q = q.eq('board_id', config.board_id)
    q = applyFilters(q, config.filters ?? [])

    const { count } = await q
    const n = count ?? 0
    const prefix = config.prefix ?? ''
    const suffix = config.suffix ? ` ${config.suffix}` : ''
    return { value: n, formatted: `${prefix}${n.toLocaleString()}${suffix}` }
  }

  // sum of records.value
  let q = supabase
    .from('records')
    .select('value')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .not('value', 'is', null)

  if (config.board_id) q = q.eq('board_id', config.board_id)
  q = applyFilters(q, config.filters ?? [])

  const { data } = await q
  const total = (data ?? []).reduce((s: number, r: any) => s + (r.value ?? 0), 0)
  const prefix = config.prefix ?? '$'
  return { value: total, formatted: `${prefix}${total.toLocaleString()}` }
}

// ── List widget ───────────────────────────────────────────────────────────────

export async function getListWidgetData(
  config: ListWidgetConfig,
  orgId: string,
): Promise<ListWidgetData> {
  const supabase = await createClient()

  let q = supabase
    .from('records')
    .select('id, title, status, priority, value, group_id, updated_at')
    .eq('organization_id', orgId)
    .eq('is_archived', false)

  if (config.board_id) q = q.eq('board_id', config.board_id)
  q = applyFilters(q, config.filters ?? [])

  const asc = config.sort_direction === 'asc'
  q = q.order(config.sort_field ?? 'updated_at', { ascending: asc })
  q = q.limit(config.max_records ?? 10)

  const { data: records } = await q

  // Resolve group names
  const groupIds = [...new Set((records ?? []).map((r: any) => r.group_id).filter(Boolean))]
  let groupNames: Record<string, string> = {}

  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('board_groups')
      .select('id, name')
      .in('id', groupIds)
    groupNames = Object.fromEntries((groups ?? []).map((g: any) => [g.id, g.name]))
  }

  const rows = (records ?? []).map((r: any) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    value: r.value,
    group_name: r.group_id ? (groupNames[r.group_id] ?? null) : null,
    updated_at: r.updated_at,
  }))

  return { records: rows, total: rows.length }
}

// ── Board summary widget ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active:   '#3b82f6',
  won:      '#10b981',
  lost:     '#ef4444',
  on_hold:  '#f59e0b',
  archived: '#6b7280',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high:   '#f97316',
  medium: '#eab308',
  low:    '#3b82f6',
  none:   '#6b7280',
}

export async function getBoardSummaryData(
  config: BoardSummaryWidgetConfig,
  orgId: string,
): Promise<BoardSummaryData> {
  const supabase = await createClient()
  const empty: BoardSummaryData = { rows: [], grand_total_count: 0, grand_total_value: 0 }

  if (!config.board_id) return empty

  if (config.group_by === 'group') {
    const [recordsRes, groupsRes] = await Promise.all([
      supabase
        .from('records')
        .select('group_id, value')
        .eq('board_id', config.board_id)
        .eq('organization_id', orgId)
        .eq('is_archived', false),
      supabase
        .from('board_groups')
        .select('id, name, color')
        .eq('board_id', config.board_id)
        .eq('is_archived', false)
        .order('position', { ascending: true }),
    ])

    const records = recordsRes.data ?? []
    const groups = groupsRes.data ?? []

    const agg = new Map<string, { count: number; value: number }>()
    for (const r of records) {
      const key = r.group_id ?? '__none'
      const cur = agg.get(key) ?? { count: 0, value: 0 }
      agg.set(key, { count: cur.count + 1, value: cur.value + (r.value ?? 0) })
    }

    const totalCount = records.length
    const rows: BoardSummaryRow[] = groups.map((g: any) => {
      const a = agg.get(g.id) ?? { count: 0, value: 0 }
      return {
        label: g.name,
        count: a.count,
        total_value: a.value,
        color: g.color,
        percentage: totalCount > 0 ? Math.round((a.count / totalCount) * 100) : 0,
      }
    })

    return {
      rows,
      grand_total_count: totalCount,
      grand_total_value: rows.reduce((s, r) => s + r.total_value, 0),
    }
  }

  if (config.group_by === 'status') {
    const { data: records } = await supabase
      .from('records')
      .select('status, value')
      .eq('board_id', config.board_id)
      .eq('organization_id', orgId)
      .eq('is_archived', false)

    const agg = new Map<string, { count: number; value: number }>()
    for (const r of records ?? []) {
      const cur = agg.get(r.status) ?? { count: 0, value: 0 }
      agg.set(r.status, { count: cur.count + 1, value: cur.value + (r.value ?? 0) })
    }
    const totalCount = (records ?? []).length
    const rows = [...agg.entries()].map(([status, a]) => ({
      label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' '),
      count: a.count,
      total_value: a.value,
      color: STATUS_COLORS[status] ?? '#6b7280',
      percentage: totalCount > 0 ? Math.round((a.count / totalCount) * 100) : 0,
    }))

    return {
      rows,
      grand_total_count: totalCount,
      grand_total_value: rows.reduce((s, r) => s + r.total_value, 0),
    }
  }

  // group_by === 'priority'
  const { data: records } = await supabase
    .from('records')
    .select('priority, value')
    .eq('board_id', config.board_id)
    .eq('organization_id', orgId)
    .eq('is_archived', false)

  const PRIORITY_ORDER = ['urgent', 'high', 'medium', 'low', 'none']
  const agg = new Map<string, { count: number; value: number }>()
  for (const r of records ?? []) {
    const cur = agg.get(r.priority) ?? { count: 0, value: 0 }
    agg.set(r.priority, { count: cur.count + 1, value: cur.value + (r.value ?? 0) })
  }
  const totalCount = (records ?? []).length
  const rows = PRIORITY_ORDER
    .filter(p => agg.has(p))
    .map(p => {
      const a = agg.get(p)!
      return {
        label: p.charAt(0).toUpperCase() + p.slice(1),
        count: a.count,
        total_value: a.value,
        color: PRIORITY_COLORS[p] ?? '#6b7280',
        percentage: totalCount > 0 ? Math.round((a.count / totalCount) * 100) : 0,
      }
    })

  return {
    rows,
    grand_total_count: totalCount,
    grand_total_value: rows.reduce((s, r) => s + r.total_value, 0),
  }
}

// Re-export BoardSummaryRow so callers don't have to import from types too
export type { BoardSummaryRow }

// ── Bulk data fetch for all widgets on a dashboard ────────────────────────────

export async function getDashboardWidgetData(
  widgets: DashboardWidgetRow[],
  orgId: string,
): Promise<Record<string, WidgetData>> {
  const results = await Promise.all(
    widgets.map(async (w): Promise<[string, WidgetData]> => {
      try {
        if (w.widget_type === 'metric') {
          const data = await getMetricWidgetData(w.config as MetricWidgetConfig, orgId)
          return [w.id, { type: 'metric', data }]
        }
        if (w.widget_type === 'list') {
          const data = await getListWidgetData(w.config as ListWidgetConfig, orgId)
          return [w.id, { type: 'list', data }]
        }
        if (w.widget_type === 'board_summary') {
          const data = await getBoardSummaryData(w.config as BoardSummaryWidgetConfig, orgId)
          return [w.id, { type: 'board_summary', data }]
        }
        return [w.id, { type: 'error', message: 'Unknown widget type' }]
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load widget'
        return [w.id, { type: 'error', message: msg }]
      }
    })
  )
  return Object.fromEntries(results)
}
