import { createClient } from '@/lib/supabase/server'
import type { DailyActionRow, DailyProgressRow } from './types'

/** Actions due today or overdue for the current user, plus completed-today. */
export async function getTodayActions(userId: string, today: string): Promise<DailyActionRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('daily_actions')
    .select('*')
    .eq('user_id', userId)
    .or(`due_date.lte.${today},completed_at.gte.${today}T00:00:00Z`)
    .order('priority', { ascending: true })
    .order('due_date', { ascending: true })
    .order('created_at', { ascending: true })
  return (data ?? []) as DailyActionRow[]
}

export async function getDailyAction(id: string): Promise<DailyActionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('daily_actions').select('*').eq('id', id).single()
  return (data ?? null) as DailyActionRow | null
}

export async function getDailyProgress(
  userId: string,
  date: string,
  goalId?: string,
): Promise<DailyProgressRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('daily_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
  if (goalId) q = q.eq('production_goal_id', goalId)
  const { data } = await q
  return (data ?? []) as DailyProgressRow[]
}

/** Tasks the user owns that are due-today / overdue / unscheduled-and-open. */
export async function getOpenTasksForUser(
  userId: string,
  organizationId: string,
  today: string,
): Promise<Array<{
  id: string
  title: string
  description: string | null
  priority: string
  due_date: string | null
  record_id: string | null
}>> {
  const supabase = await createClient()
  const tomorrow = new Date(today + 'T00:00:00Z')
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowISO = tomorrow.toISOString()

  const { data } = await supabase
    .from('tasks')
    .select('id, title, description, priority, due_date, record_id, assigned_user_id, organization_id, completed_at')
    .eq('organization_id', organizationId)
    .eq('assigned_user_id', userId)
    .is('completed_at', null)
    .lt('due_date', tomorrowISO)
    .order('due_date', { ascending: true })

  return (data ?? []).map((t: { id: string; title: string; description: string | null; priority: string; due_date: string | null; record_id: string | null }) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    due_date: t.due_date,
    record_id: t.record_id,
  }))
}

/** "Attention" records: those whose updated_at is stale relative to staleDays. */
export async function getStaleRecords(
  organizationId: string,
  staleDays = 14,
  limit = 8,
): Promise<Array<{ id: string; title: string; board_id: string; updated_at: string; status: string }>> {
  const supabase = await createClient()
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - staleDays)

  const { data } = await supabase
    .from('records')
    .select('id, title, board_id, updated_at, status')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .eq('status', 'active')
    .lt('updated_at', cutoff.toISOString())
    .order('updated_at', { ascending: true })
    .limit(limit)

  return (data ?? []) as Array<{ id: string; title: string; board_id: string; updated_at: string; status: string }>
}
