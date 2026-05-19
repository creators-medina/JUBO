'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskPriority } from '@/types/database'

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

  revalidatePath('/today')
}

export async function reopenDailyAction(id: string): Promise<void> {
  const supabase = await createClient()
  const { data: action } = await supabase
    .from('daily_actions')
    .select('task_id')
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
