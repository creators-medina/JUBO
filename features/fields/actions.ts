'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FieldType } from '@/types/database'

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
    config: data.config ?? {},
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
    .insert({ organization_id: board.organization_id, board_id: input.boardId, name, slug, field_type: input.fieldType, config: {}, position })
    .select('id, name, slug, field_type, position')
    .single()
  if (error || !created) throw new Error(error?.message ?? 'Could not create field')
  revalidatePath(`/boards/${input.boardId}`)
  return created as { id: string; name: string; slug: string; field_type: FieldType; position: number }
}

export async function getBoardFields(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fields')
    .select('*')
    .eq('board_id', boardId)
    .order('position', { ascending: true })
  return data ?? []
}
