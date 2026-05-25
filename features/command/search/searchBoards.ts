'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

const LIMIT = 12

export async function searchBoards(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()
  let q = supabase
    .from('boards')
    .select('id, name, description, board_type, color, icon, slug')
    .eq('organization_id', ctx.organizationId)
    .order('updated_at', { ascending: false })
    .limit(LIMIT)
  if (ctx.query.trim()) q = q.ilike('name', `%${ctx.query.trim()}%`)
  const { data } = await q
  return (data ?? []).map((b): CommandItem => ({
    id:         `board:${b.id}`,
    type:       'board',
    title:      b.name,
    subtitle:   b.description || `${b.board_type ?? 'Board'}`,
    iconName:   'Columns3',
    keywords:   [b.slug, b.board_type].filter(Boolean) as string[],
    groupLabel: 'Boards',
    href:       `/boards/${b.id}`,
    metadata:   { boardId: b.id, color: b.color, icon: b.icon },
  }))
}
