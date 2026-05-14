'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { RecordType, RecordPriority, RecordStatus } from '@/types/database'

export async function createRecord(data: {
  organization_id: string
  board_id: string
  group_id: string
  title: string
  record_type?: RecordType
  priority?: RecordPriority
  value?: number
  fieldValues?: Array<{ field_id: string; value_text?: string; value_number?: number; value_boolean?: boolean; value_date?: string; value_json?: unknown }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { fieldValues, ...recordData } = data

  const { data: record, error: recordError } = await supabase
    .from('records')
    .insert({ ...recordData, created_by: user.id, owner_user_id: user.id })
    .select()
    .single()

  if (recordError) throw new Error(recordError.message)

  // Insert field values if any
  if (fieldValues && fieldValues.length > 0) {
    const fvInserts = fieldValues
      .filter(fv => fv.value_text !== undefined || fv.value_number !== undefined || fv.value_boolean !== undefined || fv.value_date !== undefined || fv.value_json !== undefined)
      .map(fv => ({ ...fv, record_id: record.id }))
    if (fvInserts.length > 0) {
      await supabase.from('field_values').insert(fvInserts)
    }
  }

  // Log creation activity
  await supabase.from('activities').insert({
    organization_id: data.organization_id,
    record_id: record.id,
    user_id: user.id,
    activity_type: 'creation',
    content: `Record created: ${data.title}`,
    metadata: { record_type: data.record_type ?? 'custom' },
  })

  revalidatePath(`/boards/${data.board_id}`)
  return record
}

export async function updateRecord(
  recordId: string,
  boardId: string,
  updates: {
    title?: string
    status?: RecordStatus
    priority?: RecordPriority
    value?: number | null
    assigned_user_id?: string | null
  },
  previousValues?: Record<string, unknown>
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: record, error } = await supabase
    .from('records')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', recordId)
    .select('organization_id')
    .single()

  if (error) throw new Error(error.message)

  // Log activity for significant changes
  const significantFields = ['title', 'status', 'priority']
  const changed = significantFields.filter(f => updates[f as keyof typeof updates] !== undefined)
  if (changed.length > 0) {
    await supabase.from('activities').insert({
      organization_id: record.organization_id,
      record_id: recordId,
      user_id: user.id,
      activity_type: 'field_change',
      content: changed.map(f => `${f} updated`).join(', '),
      metadata: { changes: updates, previous: previousValues ?? {} },
    })
  }

  revalidatePath(`/boards/${boardId}`)
}

export async function upsertFieldValue(
  fieldId: string,
  recordId: string,
  boardId: string,
  value: {
    value_text?: string | null
    value_number?: number | null
    value_boolean?: boolean | null
    value_date?: string | null
    value_json?: unknown | null
  }
) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('field_values')
    .upsert(
      { field_id: fieldId, record_id: recordId, ...value },
      { onConflict: 'field_id,record_id' }
    )
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

export async function moveRecord(recordId: string, toGroupId: string, boardId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.rpc('move_record', {
    p_record_id: recordId,
    p_to_group_id: toGroupId,
    p_moved_by: user.id,
    p_movement_type: 'stage_change',
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}
