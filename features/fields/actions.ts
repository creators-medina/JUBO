'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { defaultStatusOptions, parseOptions } from '@/features/fields/status'
import { buildVisibilityIndex, commonFieldIds, type FieldVisibilityRow } from '@/features/fields/visibility'
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
