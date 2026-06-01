'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
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

  // Fire workflow engine (best-effort; never blocks the create)
  await dispatchWorkflowEvent({
    type: 'record.created',
    organizationId: data.organization_id,
    recordId: record.id,
  })

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

  // Capture prior group for the workflow payload
  const { data: before } = await supabase
    .from('records')
    .select('group_id, organization_id')
    .eq('id', recordId)
    .single()

  const { error } = await supabase.rpc('move_record', {
    p_record_id: recordId,
    p_to_group_id: toGroupId,
    p_moved_by: user.id,
    p_movement_type: 'stage_change',
  })

  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)

  // Fire workflow engine for the stage change (best-effort)
  if (before?.organization_id && before.group_id !== toGroupId) {
    const { data: grp } = await supabase.from('board_groups').select('name').eq('id', toGroupId).single()
    await dispatchWorkflowEvent({
      type: 'record.group_changed',
      organizationId: before.organization_id,
      recordId,
      fromGroupId: before.group_id,
      toGroupId,
      toGroupName: grp?.name ?? null,
    })
  }
}

// ── Phase 29 — Subitems + bulk actions ────────────────────────────────────────

/** Create a subitem (child record) under a parent. Inherits board + group. */
export async function createSubitem(parentRecordId: string, title: string): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const t = title.trim()
  if (!t) throw new Error('Title is required')

  const { data: parent } = await supabase
    .from('records')
    .select('organization_id, board_id, group_id, record_type')
    .eq('id', parentRecordId).maybeSingle()
  if (!parent) throw new Error('Parent record not found')

  const { data: created, error } = await supabase.from('records').insert({
    organization_id: parent.organization_id,
    board_id: parent.board_id,
    group_id: parent.group_id,
    parent_record_id: parentRecordId,
    title: t,
    record_type: parent.record_type ?? 'custom',
    owner_user_id: user.id,
    created_by: user.id,
  }).select('id').single()
  if (error || !created) throw new Error(error?.message ?? 'Could not create subitem')

  revalidatePath(`/boards/${parent.board_id}`)
  return { id: created.id }
}

/** Move many records to a single group on the SAME board (loops the RPC so
 * each one gets movement history + workflow dispatch). */
export async function bulkMoveRecords(recordIds: string[], toGroupId: string, boardId: string): Promise<{ moved: number; failed: number }> {
  if (recordIds.length === 0) return { moved: 0, failed: 0 }
  let moved = 0, failed = 0
  for (const id of recordIds) {
    try { await moveRecord(id, toGroupId, boardId); moved++ } catch { failed++ }
  }
  revalidatePath(`/boards/${boardId}`)
  return { moved, failed }
}

/** Archive a batch of records — preserves data, hides from default board views. */
export async function bulkArchiveRecords(recordIds: string[], boardId: string): Promise<{ archived: number }> {
  if (recordIds.length === 0) return { archived: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('records')
    .update({ is_archived: true, status: 'archived', updated_at: new Date().toISOString() })
    .in('id', recordIds)
  if (error) throw new Error(error.message)

  revalidatePath(`/boards/${boardId}`)
  return { archived: recordIds.length }
}

/** Permanently delete a batch of records. Field values cascade via FK. */
export async function bulkDeleteRecords(recordIds: string[], boardId: string): Promise<{ deleted: number }> {
  if (recordIds.length === 0) return { deleted: 0 }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('records').delete().in('id', recordIds)
  if (error) throw new Error(error.message)

  revalidatePath(`/boards/${boardId}`)
  return { deleted: recordIds.length }
}
