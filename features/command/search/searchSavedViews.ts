'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

const LIMIT = 8

export async function searchSavedViews(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()
  let q = supabase
    .from('saved_views')
    .select('id, name, board_id, is_attention_view, attention_label')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (ctx.query.trim()) q = q.ilike('name', `%${ctx.query.trim()}%`)
  const { data } = await q
  if (!data || data.length === 0) return []

  const boardIds = [...new Set(data.map(v => v.board_id).filter(Boolean))] as string[]
  const boardsRes = boardIds.length
    ? await supabase.from('boards').select('id, name').in('id', boardIds)
    : { data: [] }
  const boardName = new Map(((boardsRes.data ?? []) as Array<{ id: string; name: string }>).map(b => [b.id, b.name]))

  return data.map((v): CommandItem => ({
    id:         `saved_view:${v.id}`,
    type:       'saved_view',
    title:      v.attention_label || v.name,
    subtitle:   v.board_id ? `Saved view · ${boardName.get(v.board_id) ?? 'Board'}` : 'Saved view',
    iconName:   v.is_attention_view ? 'Flag' : 'Bookmark',
    groupLabel: 'Saved Views',
    href:       v.board_id ? `/boards/${v.board_id}` : undefined,
    metadata:   { savedViewId: v.id, boardId: v.board_id },
  }))
}
