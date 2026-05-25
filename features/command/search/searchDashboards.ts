'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

const LIMIT = 10

export async function searchDashboards(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()
  let q = supabase
    .from('dashboards')
    .select('id, name, description, icon, slug')
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(LIMIT)
  if (ctx.query.trim()) q = q.ilike('name', `%${ctx.query.trim()}%`)
  const { data } = await q
  return (data ?? []).map((d): CommandItem => ({
    id:         `dashboard:${d.id}`,
    type:       'dashboard',
    title:      d.name,
    subtitle:   d.description ?? 'Dashboard',
    iconName:   'LayoutDashboard',
    keywords:   [d.slug].filter(Boolean) as string[],
    groupLabel: 'Dashboards',
    href:       `/dashboards/${d.id}`,
  }))
}
