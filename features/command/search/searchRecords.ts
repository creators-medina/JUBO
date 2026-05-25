'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

// Records search — by title (ilike), capped, with board name resolution so the
// result row can show a real breadcrumb. Kept client-side because the palette
// is fully interactive and we want sub-100ms feedback.
const LIMIT = 12

export async function searchRecords(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()

  let query = supabase
    .from('records')
    .select('id, title, status, board_id, group_id, updated_at')
    .eq('organization_id', ctx.organizationId)
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(LIMIT)

  if (ctx.query.trim()) {
    query = query.ilike('title', `%${ctx.query.trim()}%`)
  }

  const { data: records } = await query
  if (!records || records.length === 0) return []

  // Resolve board names + group names in one extra round-trip each
  const boardIds = [...new Set(records.map(r => r.board_id).filter(Boolean))] as string[]
  const groupIds = [...new Set(records.map(r => r.group_id).filter(Boolean))] as string[]

  const [boardsRes, groupsRes] = await Promise.all([
    boardIds.length ? supabase.from('boards').select('id, name').in('id', boardIds) : Promise.resolve({ data: [] }),
    groupIds.length ? supabase.from('board_groups').select('id, name').in('id', groupIds) : Promise.resolve({ data: [] }),
  ])

  const boardName = new Map(((boardsRes.data ?? []) as Array<{ id: string; name: string }>).map(b => [b.id, b.name]))
  const groupName = new Map(((groupsRes.data ?? []) as Array<{ id: string; name: string }>).map(g => [g.id, g.name]))

  return records.map((r): CommandItem => {
    const board = r.board_id ? boardName.get(r.board_id) ?? 'Board' : null
    const group = r.group_id ? groupName.get(r.group_id) ?? null : null
    const subtitle = [board, group].filter(Boolean).join(' · ')
    return {
      id:         `record:${r.id}`,
      type:       'record',
      title:      r.title,
      subtitle:   subtitle || undefined,
      iconName:   'FileText',
      keywords:   [r.status, board ?? '', group ?? ''].filter(Boolean),
      groupLabel: 'Records',
      metadata:   { recordId: r.id, boardId: r.board_id, status: r.status },
    }
  })
}
