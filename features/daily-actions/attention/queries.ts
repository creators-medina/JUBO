// Attention views — saved_views with is_attention_view + show_on_today = true.
// They surface on /today with a live record count derived from their filters.

import { createClient } from '@/lib/supabase/server'
import type { SavedViewRow } from '@/features/widgets/types'

export type AttentionView = {
  view: SavedViewRow
  count: number
  href: string
}

type FilterSpec = { field: string; operator: string; value: string }

/** Pull every active attention view for the org, surfaced on Today. */
export async function getAttentionViews(organizationId: string): Promise<SavedViewRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saved_views')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_attention_view', true)
    .eq('show_on_today', true)
    .order('attention_priority', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true })
  return (data ?? []) as SavedViewRow[]
}

/**
 * Count records matching a saved view's filters. Mirrors the logic in
 * getSavedViewWidgetData — `as any` typing on the query builder avoids
 * Supabase's deep generic instantiation crash when chaining .eq() in a loop.
 */
export async function getAttentionViewCount(
  view: SavedViewRow,
  organizationId: string,
): Promise<number> {
  const supabase = await createClient()
  const filters = (Array.isArray(view.filters) ? view.filters : []) as FilterSpec[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_archived', false)

  if (view.board_id) q = q.eq('board_id', view.board_id)
  for (const f of filters) {
    if (f.operator === 'eq')  q = q.eq(f.field, f.value)
    if (f.operator === 'neq') q = q.neq(f.field, f.value)
  }

  const { count } = await q
  return count ?? 0
}

/** Resolve all attention views into render-ready { view, count, href } rows. */
export async function getAttentionViewsWithCounts(organizationId: string): Promise<AttentionView[]> {
  const views = await getAttentionViews(organizationId)
  if (views.length === 0) return []

  const results = await Promise.all(views.map(async (v) => ({
    view: v,
    count: await getAttentionViewCount(v, organizationId),
    href: v.board_id ? `/boards/${v.board_id}` : '/boards',
  })))
  return results
}
