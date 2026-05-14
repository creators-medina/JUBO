'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskPriority } from '@/types/database'

export async function createTask(data: {
  organization_id: string
  record_id: string
  board_id: string
  title: string
  due_date?: string | null
  priority?: TaskPriority
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { board_id, ...taskData } = data

  const { data: task, error } = await supabase
    .from('tasks')
    .insert({ ...taskData, created_by: user.id, assigned_user_id: user.id })
    .select()
    .single()

  if (error) throw new Error(error.message)

  await supabase.from('activities').insert({
    organization_id: data.organization_id,
    record_id: data.record_id,
    user_id: user.id,
    activity_type: 'custom',
    content: `Task created: ${data.title}`,
    metadata: { task_id: task.id },
  })

  revalidatePath(`/boards/${board_id}`)
  return task
}

export async function completeTask(taskId: string, recordId: string, organizationId: string, boardId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('tasks')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', taskId)

  if (error) throw new Error(error.message)

  await supabase.from('activities').insert({
    organization_id: organizationId,
    record_id: recordId,
    user_id: user.id,
    activity_type: 'custom',
    content: 'Task completed',
    metadata: { task_id: taskId },
  })

  revalidatePath(`/boards/${boardId}`)
}

export async function reopenTask(taskId: string, boardId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ completed_at: null })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}
