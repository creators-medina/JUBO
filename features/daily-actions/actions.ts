'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskPriority } from '@/types/database'
import { snapshotDailyProgress } from './progress/snapshots'

/**
 * After every mutation that affects today's open/completed counts we snapshot
 * daily_progress. Best-effort — failures are swallowed so we don't break the
 * surface action.
 */
async function snapshotSafe(organizationId: string, userId: string): Promise<void> {
  try { await snapshotDailyProgress({ organizationId, userId }) } catch { /* swallow */ }
}

// ── Manual creation ──────────────────────────────────────────────────────────

export async function createDailyAction(input: {
  organization_id: string
  title: string
  description?: string
  priority?: TaskPriority
  due_date?: string                    // YYYY-MM-DD
  action_type?: string
  source?: string
  production_goal_id?: string | null
  record_id?: string | null
  task_id?: string | null
}): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase.rpc('create_daily_action', {
    p_organization_id:    input.organization_id,
    p_title:              input.title,
    p_description:        input.description ?? null,
    p_priority:           input.priority ?? 'medium',
    p_due_date:           input.due_date ?? new Date().toISOString().slice(0, 10),
    p_action_type:        input.action_type ?? 'general',
    p_source:             input.source ?? 'manual',
    p_production_goal_id: input.production_goal_id ?? null,
    p_record_id:          input.record_id ?? null,
    p_task_id:            input.task_id ?? null,
  })
  if (error) throw new Error(error.message)
  await snapshotSafe(input.organization_id, user.id)
  revalidatePath('/today')
  return data as string
}

// ── Completion ───────────────────────────────────────────────────────────────

export async function completeDailyAction(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Fetch first to know if this is task-linked / record-linked for side effects
  const { data: action } = await supabase
    .from('daily_actions')
    .select('id, task_id, record_id, organization_id, title')
    .eq('id', id)
    .single()
  if (!action) throw new Error('Action not found')

  const completedAt = new Date().toISOString()

  const { error } = await supabase
    .from('daily_actions')
    .update({ completed_at: completedAt })
    .eq('id', id)
  if (error) throw new Error(error.message)

  // If task-linked, complete the task too. Direct update is fine — RLS allows
  // org members to update their own tasks.
  if (action.task_id) {
    await supabase.from('tasks').update({ completed_at: completedAt }).eq('id', action.task_id)
  }

  // If record-linked, log a lightweight activity for the audit trail.
  if (action.record_id) {
    await supabase.from('activities').insert({
      organization_id: action.organization_id,
      record_id: action.record_id,
      user_id: user.id,
      activity_type: 'note',
      content: `Completed daily action: ${action.title}`,
    })
  }

  await snapshotSafe(action.organization_id, user.id)
  revalidatePath('/today')
}

export async function reopenDailyAction(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: action } = await supabase
    .from('daily_actions')
    .select('task_id, organization_id')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('daily_actions')
    .update({ completed_at: null })
    .eq('id', id)
  if (error) throw new Error(error.message)

  if (action?.task_id) {
    await supabase.from('tasks').update({ completed_at: null }).eq('id', action.task_id)
  }

  if (action?.organization_id) {
    await snapshotSafe(action.organization_id, user.id)
  }
  revalidatePath('/today')
}

export async function deleteDailyAction(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('daily_actions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/today')
}

export async function updateDailyAction(id: string, updates: {
  title?: string
  description?: string | null
  priority?: TaskPriority
  due_date?: string
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('daily_actions').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/today')
}

// ── Snooze / reschedule ──────────────────────────────────────────────────────

export async function snoozeDailyAction(id: string, dueDate: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.rpc('snooze_daily_action', { p_id: id, p_due_date: dueDate })
  if (error) throw new Error(error.message)

  // Read org_id for snapshot
  const { data } = await supabase.from('daily_actions').select('organization_id').eq('id', id).single()
  if (data?.organization_id) await snapshotSafe(data.organization_id, user.id)
  revalidatePath('/today')
}

// ── Bulk operations ──────────────────────────────────────────────────────────

export async function bulkCompleteDailyActions(ids: string[], complete: boolean = true): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.rpc('bulk_complete_daily_actions', {
    p_ids:      ids,
    p_complete: complete,
  })
  if (error) throw new Error(error.message)

  const { data: first } = await supabase
    .from('daily_actions')
    .select('organization_id')
    .eq('id', ids[0])
    .single()
  if (first?.organization_id) await snapshotSafe(first.organization_id, user.id)
  revalidatePath('/today')
}

export async function bulkSnoozeDailyActions(ids: string[], dueDate: string): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.rpc('bulk_snooze_daily_actions', {
    p_ids:      ids,
    p_due_date: dueDate,
  })
  if (error) throw new Error(error.message)

  const { data: first } = await supabase
    .from('daily_actions')
    .select('organization_id')
    .eq('id', ids[0])
    .single()
  if (first?.organization_id) await snapshotSafe(first.organization_id, user.id)
  revalidatePath('/today')
}

export async function bulkDeleteDailyActions(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('daily_actions').delete().in('id', ids)
  if (error) throw new Error(error.message)
  // Snapshot will reflect the deletion on next /today load
  revalidatePath('/today')
}

// ── Manual regenerate from the Today page ────────────────────────────────────

export async function regenerateDailyActions(): Promise<{
  taskActions: number
  pacingActions: number
  total: number
}> {
  const { generateDailyActionsForUser } = await import('./generation')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!membership) throw new Error('No org membership')

  const report = await generateDailyActionsForUser({
    organizationId: membership.organization_id,
    userId: user.id,
  })
  await snapshotSafe(membership.organization_id, user.id)
  revalidatePath('/today')
  return report
}
