'use client'

import { createClient } from '@/lib/supabase/client'
import type { CommandItem, SearchContext } from '../types'

const LIMIT = 8

// Tasks are intentionally narrow — only open tasks for the current user. The
// palette isn't a full task browser; that's what the workspace Tasks tab is for.
export async function searchTasks(ctx: SearchContext): Promise<CommandItem[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  let q = supabase
    .from('tasks')
    .select('id, title, record_id, due_date, priority')
    .eq('organization_id', ctx.organizationId)
    .eq('assigned_user_id', user.id)
    .is('completed_at', null)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(LIMIT)
  if (ctx.query.trim()) q = q.ilike('title', `%${ctx.query.trim()}%`)
  const { data } = await q
  if (!data || data.length === 0) return []

  return data.map((t): CommandItem => ({
    id:         `task:${t.id}`,
    type:       'task',
    title:      t.title,
    subtitle:   t.due_date ? `Due ${t.due_date.slice(0, 10)} · ${t.priority}` : `${t.priority} priority`,
    iconName:   'CheckSquare',
    groupLabel: 'My Open Tasks',
    metadata:   { taskId: t.id, recordId: t.record_id },
  }))
}
