'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import { buildVisibilityIndex, type FieldVisibilityRow } from '@/features/fields/visibility'
import {
  computeGroupChecklist, groupChecklistFields, isChecklistChecked, isChecklistFieldType,
  type FieldValueLike,
} from '@/features/fields/checklist'
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
  const { data: { user } } = await supabase.auth.getUser()

  // Load field meta + prior value first — needed for change detection so the
  // status-change event fires only when the value actually changes.
  const [{ data: field }, { data: prior }] = await Promise.all([
    supabase.from('fields').select('slug, field_type, organization_id').eq('id', fieldId).maybeSingle(),
    supabase.from('field_values')
      .select('value_text, value_number, value_boolean, value_date, value_json')
      .eq('field_id', fieldId).eq('record_id', recordId).maybeSingle(),
  ])

  const { error } = await supabase
    .from('field_values')
    .upsert(
      { field_id: fieldId, record_id: recordId, ...value },
      { onConflict: 'field_id,record_id' }
    )
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)

  // Phase 34A — emit a workflow-ready event for status/select changes. Fires
  // only on a real value change; consumed by Phase 34B automations (none yet).
  const ft = (field as { field_type?: string } | null)?.field_type
  if ((ft === 'status' || ft === 'select') && Object.prototype.hasOwnProperty.call(value, 'value_text')) {
    const fromValue = (prior as { value_text?: string | null } | null)?.value_text ?? null
    const toValue = (value.value_text ?? null) as string | null
    const orgId = (field as { organization_id?: string } | null)?.organization_id
    if (fromValue !== toValue && orgId) {
      await dispatchWorkflowEvent({
        type: 'record.field_changed',
        organizationId: orgId,
        recordId,
        boardId,
        fieldId,
        fieldSlug: (field as { slug?: string } | null)?.slug,
        fieldType: ft,
        fromValue,
        toValue,
        changedBy: user?.id ?? null,
      })
    }
  }

  // Phase 35E.1 — fire record.checklist_completed when THIS toggle completes the
  // record's group checklist: every checklist field (field_type='checklist')
  // VISIBLE in the group is checked. We only run the recompute when a checklist
  // field just transitioned unchecked→checked, so it fires once on completion,
  // never on already-complete re-saves. Hidden checklist fields never count.
  // Best-effort: a failure here never blocks the value save.
  try {
    const orgId = (field as { organization_id?: string } | null)?.organization_id
    const justChecked = ft === 'checklist' && !isChecklistChecked(prior as FieldValueLike | null) && isChecklistChecked(value as FieldValueLike)
    if (ft && isChecklistFieldType(ft) && orgId && justChecked) {
      const { data: rec } = await supabase.from('records').select('group_id').eq('id', recordId).maybeSingle()
      const groupId = (rec as { group_id?: string | null } | null)?.group_id ?? null
      if (groupId) {
        const { data: fields } = await supabase
          .from('fields').select('id, name, field_type').eq('board_id', boardId)
        const fieldList = (fields ?? []) as { id: string; name: string; field_type: string }[]
        const fieldIds = fieldList.map((f) => f.id)
        if (fieldIds.length > 0) {
          const [{ data: visRows }, { data: fvs }] = await Promise.all([
            supabase.from('field_group_visibility').select('field_id, group_id').in('field_id', fieldIds),
            supabase.from('field_values').select('field_id, value_boolean').eq('record_id', recordId),
          ])
          const visibilityIndex = buildVisibilityIndex((visRows ?? []) as FieldVisibilityRow[])
          const ids = new Set(groupChecklistFields(fieldList, groupId, visibilityIndex).map((f) => f.id))
          // Only relevant if the just-checked field is part of this group's checklist.
          if (ids.has(fieldId)) {
            const valuesByFieldId: Record<string, FieldValueLike> = {}
            for (const fv of (fvs ?? []) as ({ field_id: string } & FieldValueLike)[]) valuesByFieldId[fv.field_id] = fv
            const progress = computeGroupChecklist(fieldList, groupId, visibilityIndex, valuesByFieldId)
            if (progress.isComplete) {
              await dispatchWorkflowEvent({
                type: 'record.checklist_completed',
                organizationId: orgId,
                recordId,
                boardId,
                checklistGroupId: groupId,
                checklistRequiredCount: progress.totalCount,
                checklistCompletedCount: progress.completedCount,
                changedBy: user?.id ?? null,
              })
            }
          }
        }
      }
    }
  } catch { /* checklist event is best-effort */ }
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

// ── Phase 32A — Cross-board movement ──────────────────────────────────────────

export type MoveTargetBoard = {
  id: string
  name: string
  groups: { id: string; name: string }[]
}

/** Live destination boards + groups for the move picker (org resolved server-side). */
export async function getMoveTargets(): Promise<MoveTargetBoard[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: m } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!m) return []
  const orgId = (m as { organization_id: string }).organization_id

  const [{ data: boards }, { data: groups }] = await Promise.all([
    supabase.from('boards').select('id, name').eq('organization_id', orgId).eq('is_archived', false).order('created_at', { ascending: true }),
    supabase.from('board_groups').select('id, name, board_id, position').eq('is_archived', false).order('position', { ascending: true }),
  ])

  const groupsByBoard = new Map<string, { id: string; name: string }[]>()
  for (const g of (groups as any[] ?? [])) {
    const arr = groupsByBoard.get(g.board_id) ?? []
    arr.push({ id: g.id, name: g.name })
    groupsByBoard.set(g.board_id, arr)
  }
  return (boards as any[] ?? []).map((b) => ({ id: b.id, name: b.name, groups: groupsByBoard.get(b.id) ?? [] }))
}

const MOVE_RPC_ERRORS = new Set([
  'record_not_found', 'forbidden', 'board_not_found', 'cross_org', 'group_not_found', 'group_board_mismatch',
])

/**
 * Move a record (and its subitems) to another board + group. Same record, all
 * history preserved. Validation + the board/group invariant are enforced in the
 * SECURITY DEFINER RPC; field_values are left untouched.
 */
export async function moveRecordToBoard(
  recordId: string,
  toBoardId: string,
  toGroupId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'unauthorized' }

  const { data: before } = await supabase
    .from('records').select('board_id, group_id, organization_id').eq('id', recordId).single()

  const { data, error } = await supabase.rpc('move_record_to_board', {
    p_record_id: recordId,
    p_to_board_id: toBoardId,
    p_to_group_id: toGroupId,
    p_moved_by: user.id,
  })
  if (error) return { error: error.message }
  const res = (data ?? {}) as Record<string, unknown>
  if (res.error) return { error: MOVE_RPC_ERRORS.has(String(res.error)) ? String(res.error) : 'move_failed' }

  if (before?.board_id) revalidatePath(`/boards/${before.board_id}`)
  revalidatePath(`/boards/${toBoardId}`)
  revalidatePath('/dashboard')

  // Fire the workflow engine exactly like a same-board move (destination group).
  if (before?.organization_id) {
    const { data: grp } = await supabase.from('board_groups').select('name').eq('id', toGroupId).single()
    await dispatchWorkflowEvent({
      type: 'record.group_changed',
      organizationId: before.organization_id,
      recordId,
      fromGroupId: before.group_id ?? null,
      toGroupId,
      toGroupName: grp?.name ?? null,
    })
  }
  return { ok: true }
}

/** Move several records to one destination board + group (loops per record). */
export async function bulkMoveRecordsToBoard(
  recordIds: string[],
  toBoardId: string,
  toGroupId: string,
): Promise<{ moved: number; failed: number }> {
  if (recordIds.length === 0) return { moved: 0, failed: 0 }
  let moved = 0, failed = 0
  for (const id of recordIds) {
    const res = await moveRecordToBoard(id, toBoardId, toGroupId)
    if ('ok' in res) moved++; else failed++
  }
  revalidatePath(`/boards/${toBoardId}`)
  return { moved, failed }
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
