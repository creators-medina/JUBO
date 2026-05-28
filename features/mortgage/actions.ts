'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Log a contact touch (call) on a record. */
export async function markContacted(recordId: string, organizationId: string): Promise<void> {
  const { supabase, user } = await requireUser()
  await supabase.from('activities').insert({
    organization_id: organizationId, record_id: recordId, user_id: user.id,
    activity_type: 'call', content: 'Marked as contacted',
  })
  await supabase.from('records').update({ updated_at: new Date().toISOString() }).eq('id', recordId)
  revalidatePath('/today')
}

/** Set the next action a few days out (reuses the generic set_next_action RPC). */
export async function scheduleFollowUp(recordId: string, days = 2, label = 'Follow up'): Promise<void> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase.rpc('set_next_action', {
    p_record_id: recordId, p_next_action: label, p_due_at: isoInDays(days), p_user_id: user.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/today')
}

/** Advance a record to the next board group (reuses move_record). */
export async function advanceMilestone(recordId: string, boardId: string): Promise<{ moved: boolean; to?: string }> {
  const { supabase, user } = await requireUser()
  const { data: rec } = await supabase.from('records').select('group_id').eq('id', recordId).single()
  const { data: groups } = await supabase
    .from('board_groups').select('id, name, position').eq('board_id', boardId).eq('is_archived', false).order('position')
  if (!groups || groups.length === 0) return { moved: false }
  const idx = groups.findIndex((g) => g.id === rec?.group_id)
  const next = groups[idx + 1]
  if (!next) return { moved: false }
  const { error } = await supabase.rpc('move_record', {
    p_record_id: recordId, p_to_group_id: next.id, p_moved_by: user.id, p_movement_type: 'stage_change',
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
  revalidatePath('/today')
  return { moved: true, to: next.name }
}

/** Log a partner touch (meeting). */
export async function addPartnerTouch(recordId: string, organizationId: string): Promise<void> {
  const { supabase, user } = await requireUser()
  await supabase.from('activities').insert({
    organization_id: organizationId, record_id: recordId, user_id: user.id,
    activity_type: 'meeting', content: 'Logged a partner touch',
  })
  await supabase.from('records').update({ updated_at: new Date().toISOString() }).eq('id', recordId)
  revalidatePath('/today')
}

/** Create a task for the record's next loan anniversary (past-client retention). */
export async function createAnniversaryReminder(recordId: string, organizationId: string): Promise<void> {
  const { supabase, user } = await requireUser()
  const title = 'Annual review / check-in'
  const { data: existing } = await supabase
    .from('tasks').select('id').eq('record_id', recordId).eq('title', title).is('completed_at', null).limit(1)
  if (existing && existing.length > 0) return
  await supabase.from('tasks').insert({
    organization_id: organizationId, record_id: recordId, title,
    due_date: isoInDays(365), priority: 'low', created_by: user.id, assigned_user_id: user.id,
  })
  revalidatePath('/today')
}
