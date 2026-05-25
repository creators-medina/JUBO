'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

const LIMIT = 8

export async function searchGoals(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()
  let q = supabase
    .from('production_goals')
    .select('id, name, timeframe, start_date, end_date')
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .order('end_date', { ascending: false })
    .limit(LIMIT)
  if (ctx.query.trim()) q = q.ilike('name', `%${ctx.query.trim()}%`)
  const { data } = await q
  return (data ?? []).map((g): CommandItem => ({
    id:         `goal:${g.id}`,
    type:       'goal',
    title:      g.name,
    subtitle:   `${g.timeframe} · ${g.start_date} → ${g.end_date}`,
    iconName:   'Target',
    groupLabel: 'Goals',
    href:       '/goals',
    metadata:   { goalId: g.id, timeframe: g.timeframe },
  }))
}
