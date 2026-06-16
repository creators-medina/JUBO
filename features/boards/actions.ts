'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ensureDefaultStatusField } from '@/features/fields/defaultStatus'
import type { BoardType } from '@/types/database'

export async function createBoard(data: {
  organization_id: string
  name: string
  slug: string
  description?: string
  board_type: BoardType
  color?: string
  icon?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: board, error } = await supabase.from('boards').insert({
    ...data,
    created_by: user.id,
  }).select('id').single()

  if (error || !board) throw new Error(error?.message ?? 'Could not create board')

  // Seed a default group so records have a home.
  await supabase.from('board_groups').insert({ board_id: board.id, name: 'New', position: 0 })

  // Every board gets exactly one default workflow Status field (Phase 34B.2a),
  // rendered first after Item — replacing the hidden internal records.status.
  await ensureDefaultStatusField(supabase, board.id, data.organization_id)

  revalidatePath('/boards')
}

export async function createBoardGroup(data: {
  board_id: string
  name: string
  color?: string
  position: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${data.board_id}`)
}

export async function updateBoard(boardId: string, updates: {
  name?: string
  description?: string
  color?: string
  icon?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('boards').update(updates).eq('id', boardId)
  if (error) throw new Error(error.message)
  revalidatePath('/boards')
  revalidatePath(`/boards/${boardId}`)
}

/**
 * Phase 35B — archive a board (soft delete). Sets is_archived = true so it
 * disappears from the sidebar, board lists, move destinations, and search,
 * while records / fields / groups / values are all preserved. RLS scopes the
 * update to the caller's org. Reversible by clearing the flag.
 */
export async function archiveBoard(boardId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('boards').update({ is_archived: true }).eq('id', boardId)
  if (error) throw new Error(error.message)

  revalidatePath('/boards')
  revalidatePath(`/boards/${boardId}`)
}

export async function updateBoardGroup(groupId: string, boardId: string, updates: {
  name?: string
  color?: string
  position?: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').update(updates).eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

export async function deleteBoardGroup(groupId: string, boardId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').update({ is_archived: true }).eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

// ── Phase 35G — Group structure management ──────────────────────────────────

/** Archive a group (soft hide). Records are preserved; automations keyed by
 *  group id keep their reference. getBoardGroups/getMoveTargets filter archived. */
export async function archiveBoardGroup(groupId: string, boardId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { error } = await supabase.from('board_groups').update({ is_archived: true }).eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

/** Hard-delete a group — only when it holds zero records (records.group_id is
 *  ON DELETE SET NULL, so deleting a non-empty group would orphan them). */
export async function deleteBoardGroupHard(groupId: string, boardId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { count } = await supabase
    .from('records').select('id', { count: 'exact', head: true }).eq('group_id', groupId)
  if ((count ?? 0) > 0) throw new Error('This group contains records. Archive it instead or move records first.')

  // field_group_visibility / field_requirements rows for this group cascade.
  const { error } = await supabase.from('board_groups').delete().eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

/** Persist a new group order (Phase 35G). position = index. */
export async function reorderBoardGroups(boardId: string, orderedGroupIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  await Promise.all(
    orderedGroupIds.map((id, idx) =>
      supabase.from('board_groups').update({ position: idx }).eq('id', id).eq('board_id', boardId),
    ),
  )
  revalidatePath(`/boards/${boardId}`)
}

/**
 * Duplicate a group's STRUCTURE (not records): "<name> Copy", same color, placed
 * right after the original, plus the same column visibility + checklist/required
 * setup (field_group_visibility + field_requirements rows pointing at this group
 * are copied to the new group). Records are never copied.
 */
export async function duplicateBoardGroup(groupId: string, boardId: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: g } = await supabase
    .from('board_groups').select('name, color, position, group_type').eq('id', groupId).maybeSingle()
  if (!g) throw new Error('Group not found or access denied')
  const { data: board } = await supabase.from('boards').select('organization_id').eq('id', boardId).maybeSingle()
  if (!board) throw new Error('Board not found or access denied')
  const orgId = (board as { organization_id: string }).organization_id

  const { data: groups } = await supabase
    .from('board_groups').select('id, name').eq('board_id', boardId).eq('is_archived', false).order('position', { ascending: true })
  const names = new Set((groups ?? []).map((x) => x.name))
  let name = `${g.name} Copy`
  let i = 2
  while (names.has(name)) name = `${g.name} Copy ${i++}`

  const { data: ng, error } = await supabase
    .from('board_groups')
    .insert({ board_id: boardId, name, color: g.color, position: g.position, group_type: g.group_type })
    .select('id').single()
  if (error || !ng) throw new Error(error?.message ?? 'Could not duplicate group')
  const newId = ng.id as string

  // Place the copy right after the original.
  const order = (groups ?? []).map((x) => x.id)
  const idx = order.indexOf(groupId)
  order.splice(idx < 0 ? order.length : idx + 1, 0, newId)
  await Promise.all(order.map((id, p) => supabase.from('board_groups').update({ position: p }).eq('id', id)))

  // Copy visibility + requirement rows referencing the original group.
  const { data: vis } = await supabase.from('field_group_visibility').select('field_id').eq('group_id', groupId)
  if (vis && vis.length > 0) {
    await supabase.from('field_group_visibility').insert(
      vis.map((v: { field_id: string }) => ({ organization_id: orgId, field_id: v.field_id, group_id: newId })),
    )
  }
  const { data: req } = await supabase.from('field_requirements').select('field_id, is_required').eq('group_id', groupId)
  if (req && req.length > 0) {
    await supabase.from('field_requirements').insert(
      req.map((r: { field_id: string; is_required: boolean }) => ({ organization_id: orgId, field_id: r.field_id, group_id: newId, is_required: r.is_required })),
    )
  }

  revalidatePath(`/boards/${boardId}`)
  return { id: newId }
}

/**
 * Duplicate a board's STRUCTURE only — board ("<name> Copy"), groups, fields
 * (configs/status labels/default status), and all field visibility + requirement
 * rows (remapped to the new groups/fields). Records, field values, activities,
 * and workflows/automations are NOT copied. Returns the new board id.
 */
export async function duplicateBoardStructure(boardId: string): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: board } = await supabase
    .from('boards').select('organization_id, name, board_type, color, icon, description').eq('id', boardId).maybeSingle()
  if (!board) throw new Error('Board not found or access denied')
  const orgId = (board as { organization_id: string }).organization_id

  // Dedupe board name + slug.
  const { data: boards } = await supabase.from('boards').select('name, slug').eq('organization_id', orgId)
  const names = new Set((boards ?? []).map((b) => b.name))
  const slugs = new Set((boards ?? []).map((b) => b.slug))
  let name = `${board.name} Copy`
  let i = 2
  while (names.has(name)) name = `${board.name} Copy ${i++}`
  const sBase = (name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')) || 'board'
  let slug = sBase
  let k = 1
  while (slugs.has(slug)) slug = `${sBase}_${k++}`

  const { data: nb, error: bErr } = await supabase
    .from('boards')
    .insert({ organization_id: orgId, name, slug, board_type: board.board_type, color: board.color, icon: board.icon, description: board.description, created_by: user.id })
    .select('id').single()
  if (bErr || !nb) throw new Error(bErr?.message ?? 'Could not duplicate board')
  const newBoardId = nb.id as string

  // Groups (preserve order; map old→new ids).
  const { data: groups } = await supabase
    .from('board_groups').select('id, name, color, position, group_type').eq('board_id', boardId).eq('is_archived', false).order('position', { ascending: true })
  const groupIdMap = new Map<string, string>()
  for (const g of groups ?? []) {
    const { data: ng, error } = await supabase
      .from('board_groups').insert({ board_id: newBoardId, name: g.name, color: g.color, position: g.position, group_type: g.group_type }).select('id').single()
    if (error || !ng) throw new Error(error?.message ?? 'Could not copy group')
    groupIdMap.set(g.id, ng.id as string)
  }

  // Fields (reuse slugs — unique per board; preserves default status + configs).
  const { data: fields } = await supabase
    .from('fields').select('*').eq('board_id', boardId).order('position', { ascending: true })
  const fieldIdMap = new Map<string, string>()
  for (const f of fields ?? []) {
    const { data: nf, error } = await supabase
      .from('fields')
      .insert({
        organization_id: orgId, board_id: newBoardId, entity_type: f.entity_type ?? 'record',
        name: f.name, slug: f.slug, field_type: f.field_type, config: f.config ?? {},
        is_required: f.is_required, position: f.position, is_default_status: f.is_default_status,
        // Phase 36B — carry the common-field identity to the duplicated board.
        common_field_key_id: f.common_field_key_id ?? null,
      })
      .select('id').single()
    if (error || !nf) throw new Error(error?.message ?? 'Could not copy field')
    fieldIdMap.set(f.id, nf.id as string)
  }

  // Visibility + requirement rows, remapped.
  const oldFieldIds = (fields ?? []).map((f) => f.id)
  if (oldFieldIds.length > 0) {
    const { data: vis } = await supabase.from('field_group_visibility').select('field_id, group_id').in('field_id', oldFieldIds)
    const visInserts = (vis ?? [])
      .map((v: { field_id: string; group_id: string }) => ({ organization_id: orgId, field_id: fieldIdMap.get(v.field_id), group_id: groupIdMap.get(v.group_id) }))
      .filter((r) => r.field_id && r.group_id)
    if (visInserts.length > 0) await supabase.from('field_group_visibility').insert(visInserts)

    const { data: req } = await supabase.from('field_requirements').select('field_id, group_id, is_required').in('field_id', oldFieldIds)
    const reqInserts = (req ?? [])
      .map((r: { field_id: string; group_id: string; is_required: boolean }) => ({ organization_id: orgId, field_id: fieldIdMap.get(r.field_id), group_id: groupIdMap.get(r.group_id), is_required: r.is_required }))
      .filter((r) => r.field_id && r.group_id)
    if (reqInserts.length > 0) await supabase.from('field_requirements').insert(reqInserts)
  }

  revalidatePath('/boards')
  return { id: newBoardId }
}

export async function createSavedView(data: {
  organization_id: string
  board_id: string
  name: string
  filters: unknown
  sort?: unknown
  visible_fields?: unknown
}): Promise<string> {
  const supabase = await createClient()
  const { data: viewId, error } = await supabase.rpc('create_saved_view', {
    p_organization_id: data.organization_id,
    p_board_id:        data.board_id,
    p_name:            data.name,
    p_filters:         data.filters,
    p_sort:            data.sort ?? null,
    p_visible_fields:  data.visible_fields ?? null,
  })
  if (error) throw new Error(error.message)
  if (!viewId) throw new Error('Failed to create saved view')
  return viewId as string
}
