'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createNote(input: {
  organization_id: string
  record_id: string
  content: string
}): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_note', {
    p_organization_id: input.organization_id,
    p_record_id: input.record_id,
    p_content: input.content,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Failed to create note')
  revalidatePath(`/boards/${input.record_id}`)
  return data as string
}

export async function updateNote(noteId: string, content: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_note', { p_id: noteId, p_content: content })
  if (error) throw new Error(error.message)
}

export async function deleteNote(noteId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_note', { p_id: noteId })
  if (error) throw new Error(error.message)
}

// ── Next action ──────────────────────────────────────────────────────────────

export async function setNextAction(input: {
  record_id: string
  next_action: string | null
  next_action_due_at: string | null
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_next_action', {
    p_record_id:   input.record_id,
    p_next_action: input.next_action,
    p_due_at:      input.next_action_due_at,
  })
  if (error) throw new Error(error.message)
}

export async function completeNextAction(recordId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('complete_next_action', { p_record_id: recordId })
  if (error) throw new Error(error.message)
}
