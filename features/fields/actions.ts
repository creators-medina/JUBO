'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { defaultStatusOptions, parseOptions } from '@/features/fields/status'
import { buildVisibilityIndex, commonFieldIds, type FieldVisibilityRow } from '@/features/fields/visibility'
import { groupChecklistFields, type RequirementRow, type FieldValueLike } from '@/features/fields/checklist'
import { convertFieldValue, countConversionLoss } from '@/features/fields/conversion'
import { isTypeCompatible, isFieldEligibleForCommon, type CommonFieldKey } from '@/features/fields/commonFields'
import { autoAssignCommonKeys } from '@/features/fields/commonFieldsServer'
import type { FieldType } from '@/types/database'

/** A new status field with no options gets the Monday-style default labels. */
function seedStatusConfig(fieldType: FieldType, config?: Record<string, unknown>): Record<string, unknown> {
  const c = config ?? {}
  if (fieldType === 'status') {
    const opts = Array.isArray((c as { options?: unknown }).options) ? (c as { options?: unknown[] }).options! : []
    if (opts.length === 0) return { ...c, options: defaultStatusOptions() }
  }
  return c
}

export async function createField(data: {
  organization_id: string
  board_id: string
  name: string
  slug: string
  field_type: FieldType
  is_required?: boolean
  position?: number
  config?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('fields').insert({
    ...data,
    config: seedStatusConfig(data.field_type, data.config),
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${data.board_id}`)
}

/**
 * Phase 35A.1 — add a Notes column to an existing board, safely. A notes column
 * is a presentation field (field_type 'textarea', config.kind='notes') over the
 * existing notes system — no field_values storage, no migration. Idempotent:
 * does nothing if the board already has a notes column (duplicate prevention,
 * even under concurrent clicks).
 */
export async function addNotesColumn(boardId: string, organizationId: string): Promise<{ created: boolean }> {
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('fields')
    .select('id, slug, config')
    .eq('board_id', boardId)
  const rows = (existing as { id: string; slug: string; config: { kind?: string } | null }[] | null) ?? []
  if (rows.some((f) => f.config?.kind === 'notes')) return { created: false }

  // Keep the slug unique on the board (a non-notes "Notes" column may exist).
  const used = new Set(rows.map((f) => f.slug))
  let slug = 'notes'
  for (let i = 2; used.has(slug); i++) slug = `notes_${i}`

  const { error } = await supabase.from('fields').insert({
    organization_id: organizationId,
    board_id: boardId,
    name: 'Notes',
    slug,
    field_type: 'textarea',
    is_required: false,
    position: rows.length,
    config: { kind: 'notes' },
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
  return { created: true }
}

/**
 * Create a field during import (or any flow that needs a field from a column name).
 * Verifies the board is visible to the caller (RLS-scoped), slugifies + dedupes the
 * slug against the board, auto-positions, and RETURNS the created row so the client
 * can map to it immediately. Reusable by the next Create-Board-From-File phase.
 */
export async function createImportField(input: {
  boardId: string
  name: string
  fieldType: FieldType
}): Promise<{ id: string; name: string; slug: string; field_type: FieldType; position: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Board must be visible to the caller — RLS scopes this to their org.
  const { data: board } = await supabase
    .from('boards').select('id, organization_id').eq('id', input.boardId).maybeSingle()
  if (!board) throw new Error('Board not found or access denied')

  const name = input.name.trim()
  if (!name) throw new Error('Field name is required')

  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field'
  const { data: existing } = await supabase.from('fields').select('slug, position').eq('board_id', input.boardId)
  const slugs = new Set((existing ?? []).map((f) => f.slug))
  let slug = base
  let n = 1
  while (slugs.has(slug)) slug = `${base}_${n++}`
  const position = Math.max(0, ...((existing ?? []).map((f) => f.position ?? 0))) + 1

  const { data: created, error } = await supabase
    .from('fields')
    .insert({ organization_id: board.organization_id, board_id: input.boardId, name, slug, field_type: input.fieldType, config: seedStatusConfig(input.fieldType), position })
    .select('id, name, slug, field_type, position')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'Could not create field')

  // Phase 36B — conservative common-key auto-assignment + audit (identity only).
  await autoAssignCommonKeys(supabase, {
    organizationId: board.organization_id,
    boardId: input.boardId,
    fields: [{ id: created.id, name: created.name, field_type: created.field_type as string }],
  })

  revalidatePath(`/boards/${input.boardId}`)
  return created as { id: string; name: string; slug: string; field_type: FieldType; position: number }
}

/** Replace the options config for a select/status field. Used by StatusCell's
 *  inline "Add option" affordance and by the importer when promoting a status
 *  column to a colored select. Slug + name untouched. */
export async function updateFieldOptions(fieldId: string, options: { id?: string; label: string; color?: string }[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: field } = await supabase
    .from('fields').select('id, board_id, config').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')

  const nextConfig = { ...(field.config as Record<string, unknown> | null ?? {}), options }
  const { error } = await supabase.from('fields').update({ config: nextConfig }).eq('id', fieldId)
  if (error) throw new Error(error.message)

  revalidatePath(`/boards/${field.board_id}`)
}

/**
 * Rename one status/select option by id. Updates the config label AND cascades
 * field_values.value_text for THIS field (old label → new label) atomically via
 * the rename_status_option RPC. Other fields are never touched. No-op if the
 * label is unchanged or the option/field is missing.
 */
export async function renameStatusOption(fieldId: string, optionId: string, newLabel: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const label = newLabel.trim()
  if (!label) throw new Error('Label is required')

  const { data: field } = await supabase
    .from('fields').select('id, board_id, config').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')

  const options = parseOptions(field.config)
  const target = options.find((o) => o.id === optionId)
  if (!target) throw new Error('Option not found')
  const oldLabel = target.label
  if (oldLabel === label) return

  const nextOptions = options.map((o) => (o.id === optionId ? { ...o, label } : o))
  const { error } = await supabase.rpc('rename_status_option', {
    p_field_id: fieldId,
    p_options: nextOptions,
    p_old_label: oldLabel,
    p_new_label: label,
  })
  if (error) throw new Error(error.message)

  revalidatePath(`/boards/${field.board_id}`)
}

/**
 * Rename a field's display name (e.g. via the board table's double-click rename).
 * Only updates `name`. The slug is intentionally STABLE — downstreams
 * (features/mortgage/data.ts, features/coaching, integration runtime, import
 * synonym mapping) read fields by slug, so changing it would silently break them.
 * RLS scopes the update to the caller's org.
 */
export async function updateField(fieldId: string, updates: { name: string }): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const name = updates.name.trim()
  if (!name) throw new Error('Field name is required')
  if (name.length > 60) throw new Error('Field name is too long')

  const { data: field } = await supabase
    .from('fields').select('id, board_id').eq('id', fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')

  const { error } = await supabase.from('fields').update({ name }).eq('id', fieldId)
  if (error) throw new Error(error.message)

  revalidatePath(`/boards/${field.board_id}`)
}

export async function getBoardFields(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fields')
    .select('*')
    .eq('board_id', boardId)
    // Default workflow Status renders first after Item (Phase 34B.2a), then the
    // rest by position. Deterministic regardless of numeric position drift.
    .order('is_default_status', { ascending: false })
    .order('position', { ascending: true })
  return data ?? []
}

/**
 * Phase 35B — board fields + their group-visibility layer.
 *
 * Returns the full ordered field list, the raw visibility rows, the set of
 * common (board-wide) field ids, and a groupId → fieldIds map of restricted
 * fields. The board renderer resolves the per-group column set from this with
 * the pure helpers in features/fields/visibility.ts. A board with no rows
 * resolves every field as common → identical to pre-35B behavior.
 */
export async function getGroupVisibleFields(boardId: string): Promise<{
  fields: any[]
  visibility: FieldVisibilityRow[]
  commonFieldIds: string[]
  visibilityMap: Record<string, string[]>
}> {
  const supabase = await createClient()
  const fields = await getBoardFields(boardId)
  const fieldIds = fields.map((f: { id: string }) => f.id)

  let rows: FieldVisibilityRow[] = []
  if (fieldIds.length > 0) {
    const { data } = await supabase
      .from('field_group_visibility')
      .select('field_id, group_id')
      .in('field_id', fieldIds)
    rows = (data ?? []) as FieldVisibilityRow[]
  }

  const index = buildVisibilityIndex(rows)
  const visibilityMap: Record<string, string[]> = {}
  for (const r of rows) (visibilityMap[r.group_id] ??= []).push(r.field_id)

  return { fields, visibility: rows, commonFieldIds: commonFieldIds(fields, index), visibilityMap }
}

/**
 * Set a field's group visibility (Phase 35B).
 *   - mode 'all'  → common: delete every visibility row for the field.
 *   - mode 'only' → visible only in `groupId`: delete other rows, ensure this one.
 * Field definitions and field_values are never touched — this is presentational.
 */
export async function setFieldGroupVisibility(input: {
  fieldId: string
  boardId: string
  mode: 'all' | 'only'
  groupId?: string
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: field } = await supabase
    .from('fields').select('id, organization_id, board_id').eq('id', input.fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')

  if (input.mode === 'all') {
    const { error } = await supabase.from('field_group_visibility').delete().eq('field_id', input.fieldId)
    if (error) throw new Error(error.message)
  } else {
    if (!input.groupId) throw new Error('A group is required')
    // Restrict to exactly this group: clear other rows, then upsert this one.
    const { error: delErr } = await supabase
      .from('field_group_visibility').delete().eq('field_id', input.fieldId).neq('group_id', input.groupId)
    if (delErr) throw new Error(delErr.message)
    const { error: upErr } = await supabase
      .from('field_group_visibility')
      .upsert(
        { organization_id: (field as { organization_id: string }).organization_id, field_id: input.fieldId, group_id: input.groupId },
        { onConflict: 'field_id,group_id' },
      )
    if (upErr) throw new Error(upErr.message)
  }

  revalidatePath(`/boards/${input.boardId}`)
}

// ── Phase 35E — field requirements (preserved; future validation only) ──────
//
// These no longer drive the checklist (Phase 35E.1 moved that to checklist
// fields), but the table/data and these helpers are kept for later validation.

/** All requirement rows for a board's fields. */
export async function getBoardFieldRequirements(boardId: string): Promise<RequirementRow[]> {
  const supabase = await createClient()
  const { data: fields } = await supabase.from('fields').select('id').eq('board_id', boardId)
  const fieldIds = (fields ?? []).map((f: { id: string }) => f.id)
  if (fieldIds.length === 0) return []
  const { data } = await supabase
    .from('field_requirements')
    .select('field_id, group_id, is_required')
    .in('field_id', fieldIds)
  return (data ?? []) as RequirementRow[]
}

/**
 * Mark / unmark a field as required for a group (Phase 35E).
 * Marking upserts a row; unmarking deletes it (absence = not required). Field
 * definitions and field_values are never touched — completion is computed on read.
 */
export async function setFieldRequirement(input: {
  fieldId: string
  boardId: string
  groupId: string
  required: boolean
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: field } = await supabase
    .from('fields').select('id, organization_id').eq('id', input.fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')

  if (input.required) {
    const { error } = await supabase
      .from('field_requirements')
      .upsert(
        { organization_id: (field as { organization_id: string }).organization_id, field_id: input.fieldId, group_id: input.groupId, is_required: true },
        { onConflict: 'field_id,group_id' },
      )
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase
      .from('field_requirements').delete().eq('field_id', input.fieldId).eq('group_id', input.groupId)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/boards/${input.boardId}`)
}

// ── Phase 35E.1 — Checklist fields ──────────────────────────────────────────

/**
 * Resolve the checklist for a record's group: the checklist fields
 * (field_type='checklist') VISIBLE in that group, in board order. The workspace
 * Checklist tab reads this once and renders interactive checkboxes whose values
 * are the same field_values rows the board grid toggles.
 */
export async function getGroupChecklistFields(
  boardId: string,
  groupId: string | null,
): Promise<{ fields: { id: string; name: string }[] }> {
  if (!groupId) return { fields: [] }
  const supabase = await createClient()
  const fields = await getBoardFields(boardId)
  const fieldIds = fields.map((f: { id: string }) => f.id)
  if (fieldIds.length === 0) return { fields: [] }

  const { data: visRows } = await supabase
    .from('field_group_visibility').select('field_id, group_id').in('field_id', fieldIds)
  const visibilityIndex = buildVisibilityIndex((visRows ?? []) as FieldVisibilityRow[])
  const checklist = groupChecklistFields(
    fields as { id: string; name: string; field_type: string }[],
    groupId,
    visibilityIndex,
  )
  return { fields: checklist.map((f) => ({ id: f.id, name: f.name })) }
}

// ── Phase 35F — Column management (delete / change type / duplicate / reorder) ──

/** Load a field with its org + board, scoped by RLS. */
async function loadFieldRow(supabase: Awaited<ReturnType<typeof createClient>>, fieldId: string) {
  const { data } = await supabase
    .from('fields')
    .select('id, board_id, organization_id, name, slug, field_type, config, position, is_required, is_default_status')
    .eq('id', fieldId).maybeSingle()
  return data as null | {
    id: string; board_id: string; organization_id: string; name: string; slug: string
    field_type: FieldType; config: Record<string, unknown> | null; position: number
    is_required: boolean; is_default_status: boolean
  }
}

/**
 * Delete a column: the field row + (via FK cascade) its field_values,
 * field_group_visibility, and field_requirements. The board's default workflow
 * status field is protected (deleting it would break the 34B.2a invariant).
 */
export async function deleteField(fieldId: string, boardId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const field = await loadFieldRow(supabase, fieldId)
  if (!field) throw new Error('Field not found or access denied')
  if (field.is_default_status) throw new Error("This is the board's default status field and can't be deleted.")

  const { error } = await supabase.from('fields').delete().eq('id', fieldId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

/** How many values would be lost converting this field to `toType` (no writes). */
export async function previewFieldTypeChange(fieldId: string, toType: FieldType): Promise<{ total: number; lost: number }> {
  const supabase = await createClient()
  const field = await loadFieldRow(supabase, fieldId)
  if (!field) throw new Error('Field not found or access denied')
  if (field.field_type === toType) return { total: 0, lost: 0 }

  const { data: vals } = await supabase
    .from('field_values')
    .select('value_text, value_number, value_boolean, value_date, value_json')
    .eq('field_id', fieldId)
  return countConversionLoss(field.field_type, toType, (vals ?? []) as FieldValueLike[])
}

/**
 * Change a column's type, converting existing values per the conversion rules
 * (features/fields/conversion.ts). Unconvertible values become empty. Converting
 * to 'status' seeds the Monday default labels when none exist. The default
 * status field is protected. Field id/slug are stable (downstreams keep working).
 */
export async function changeFieldType(input: { fieldId: string; boardId: string; toType: FieldType }): Promise<{ converted: number; lost: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const field = await loadFieldRow(supabase, input.fieldId)
  if (!field) throw new Error('Field not found or access denied')
  if (field.is_default_status) throw new Error("This is the board's default status field; its type is fixed.")
  if (field.field_type === input.toType) return { converted: 0, lost: 0 }

  const { data: vals } = await supabase
    .from('field_values')
    .select('id, value_text, value_number, value_boolean, value_date, value_json')
    .eq('field_id', input.fieldId)

  let converted = 0
  let lost = 0
  for (const row of (vals ?? []) as ({ id: string } & FieldValueLike)[]) {
    const before = { value_text: row.value_text, value_number: row.value_number, value_boolean: row.value_boolean, value_date: row.value_date, value_json: row.value_json }
    const wasEmpty = before.value_text == null && before.value_number == null && before.value_boolean == null && before.value_date == null && (before.value_json == null || (Array.isArray(before.value_json) && before.value_json.length === 0))
    const patch = convertFieldValue(field.field_type, input.toType, before)
    const nowEmpty = patch.value_text == null && patch.value_number == null && patch.value_boolean == null && patch.value_date == null && (patch.value_json == null || (Array.isArray(patch.value_json) && patch.value_json.length === 0))
    if (!wasEmpty) { converted++; if (nowEmpty) lost++ }
    const { error } = await supabase.from('field_values').update(patch).eq('id', row.id)
    if (error) throw new Error(error.message)
  }

  // Seed default status labels when becoming a status field with no options.
  const nextConfig = seedStatusConfig(input.toType, (field.config ?? {}) as Record<string, unknown>)
  const { error: fErr } = await supabase
    .from('fields').update({ field_type: input.toType, config: nextConfig }).eq('id', input.fieldId)
  if (fErr) throw new Error(fErr.message)

  revalidatePath(`/boards/${input.boardId}`)
  return { converted, lost }
}

/**
 * Duplicate a column: a new "<name> Copy" field with the same type + config
 * (status labels / select options included) and the same visibility rules.
 * Values are NOT copied — the duplicate starts empty. Never default-status.
 */
export async function duplicateField(fieldId: string, boardId: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const field = await loadFieldRow(supabase, fieldId)
  if (!field) throw new Error('Field not found or access denied')

  // Dedupe name + slug against the board.
  const { data: existing } = await supabase.from('fields').select('name, slug, position').eq('board_id', boardId)
  const names = new Set((existing ?? []).map((f) => f.name))
  const slugs = new Set((existing ?? []).map((f) => f.slug))
  let name = `${field.name} Copy`
  let i = 2
  while (names.has(name)) name = `${field.name} Copy ${i++}`
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')) || 'field'
  let slug = base
  let k = 1
  while (slugs.has(slug)) slug = `${base}_${k++}`
  const position = Math.max(0, ...((existing ?? []).map((f) => f.position ?? 0))) + 1

  const { data: created, error } = await supabase
    .from('fields')
    .insert({
      organization_id: field.organization_id, board_id: boardId, name, slug,
      field_type: field.field_type, config: field.config ?? {}, is_required: field.is_required,
      position, is_default_status: false,
    })
    .select('id').single()
  if (error || !created) throw new Error(error?.message ?? 'Could not duplicate field')

  // Copy visibility rules (not values, not requirements).
  const { data: visRows } = await supabase
    .from('field_group_visibility').select('group_id').eq('field_id', fieldId)
  if (visRows && visRows.length > 0) {
    await supabase.from('field_group_visibility').insert(
      visRows.map((v: { group_id: string }) => ({ organization_id: field.organization_id, field_id: created.id, group_id: v.group_id })),
    )
  }

  revalidatePath(`/boards/${boardId}`)
  return { id: created.id as string }
}

// ── Phase 36B — Common field registry (identity only; no value movement) ─────

/** The org's common field keys (for the column-menu dropdown). */
export async function getCommonFieldKeys(): Promise<CommonFieldKey[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('common_field_keys')
    .select('id, organization_id, key, label, data_type, scope')
    .order('scope', { ascending: true })
    .order('label', { ascending: true })
  return (data ?? []) as CommonFieldKey[]
}

/**
 * Link a field to a common key. Rejects: checklist / default-status fields,
 * type-incompatible keys, and a key already used by another field on the same
 * board (Decision 6 soft-block). Never reads or writes field_values.
 */
export async function setFieldCommonKey(input: { fieldId: string; boardId: string; keyId: string }): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: field } = await supabase
    .from('fields').select('id, board_id, organization_id, field_type, is_default_status').eq('id', input.fieldId).maybeSingle()
  if (!field) throw new Error('Field not found or access denied')
  const f = field as { board_id: string; organization_id: string; field_type: string; is_default_status: boolean }

  if (!isFieldEligibleForCommon(f)) {
    throw new Error(f.field_type === 'checklist' ? "Checklist fields can't be common." : "The default status field can't be common.")
  }

  const { data: key } = await supabase
    .from('common_field_keys').select('id, label, data_type, organization_id').eq('id', input.keyId).maybeSingle()
  if (!key) throw new Error('Common key not found')
  const k = key as { id: string; label: string; data_type: string; organization_id: string }
  if (k.organization_id !== f.organization_id) throw new Error('Key belongs to another organization')
  if (!isTypeCompatible(f.field_type, k.data_type)) throw new Error(`This field’s type can’t map to ${k.label}.`)

  // Decision 6 — soft-block a key already claimed on this board.
  const { data: clash } = await supabase
    .from('fields').select('id').eq('board_id', f.board_id).eq('common_field_key_id', input.keyId).neq('id', input.fieldId).maybeSingle()
  if (clash) throw new Error(`${k.label} is already mapped on this board.`)

  const { error } = await supabase.from('fields').update({ common_field_key_id: input.keyId }).eq('id', input.fieldId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${input.boardId}`)
}

/** Clear a field's common key. Never reads or writes field_values. */
export async function clearFieldCommonKey(input: { fieldId: string; boardId: string }): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('fields').update({ common_field_key_id: null }).eq('id', input.fieldId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${input.boardId}`)
}

/** Persist a new column order (Phase 35F drag-to-reorder). Positions = index. */
export async function reorderFields(boardId: string, orderedFieldIds: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await Promise.all(
    orderedFieldIds.map((id, idx) =>
      supabase.from('fields').update({ position: idx }).eq('id', id).eq('board_id', boardId),
    ),
  )
  revalidatePath(`/boards/${boardId}`)
}
