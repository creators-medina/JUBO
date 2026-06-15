// ─────────────────────────────────────────────────────────────────────────
// Default workflow Status field helper (Phase 34B.2a).
//
// Guarantees a board has exactly one default workflow status field (a real
// field_type='status' field flagged is_default_status). Promotes an existing
// status field when present, otherwise creates one. The DB partial-unique index
// (uniq_fields_default_status) is the hard guarantee; this is the app-side path.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { defaultStatusOptions } from './status'

/**
 * Ensure the board has a default workflow status field; returns its id.
 * - forceCreate: skip promotion and always create a fresh default (used by the
 *   Monday importer so the subitem "Status" field is never promoted to default).
 */
export async function ensureDefaultStatusField(
  supabase: SupabaseClient,
  boardId: string,
  organizationId: string,
  opts?: { forceCreate?: boolean },
): Promise<string | null> {
  // 1. Already has a default?
  const { data: current } = await supabase
    .from('fields').select('id').eq('board_id', boardId).eq('is_default_status', true).maybeSingle()
  if (current?.id) return current.id

  // 2. Promote the best existing status field (unless forced to create).
  if (!opts?.forceCreate) {
    const { data: statusFields } = await supabase
      .from('fields').select('id, slug, name, position')
      .eq('board_id', boardId).eq('field_type', 'status').order('position', { ascending: true })
    const list = (statusFields ?? []) as { id: string; slug: string; name: string; position: number }[]
    if (list.length > 0) {
      const best = list.find((f) => f.slug === 'status' || (f.name ?? '').toLowerCase() === 'status') ?? list[0]
      const { error } = await supabase.from('fields').update({ is_default_status: true }).eq('id', best.id)
      if (!error) return best.id
      // Lost a race — return whatever is the default now.
      const { data: now } = await supabase.from('fields').select('id').eq('board_id', boardId).eq('is_default_status', true).maybeSingle()
      if (now?.id) return now.id
    }
  }

  // 3. Create a new default status field, positioned first.
  const { data: rows } = await supabase.from('fields').select('slug, position').eq('board_id', boardId)
  const existing = (rows ?? []) as { slug: string; position: number }[]
  const slug = existing.some((f) => f.slug === 'status') ? 'workflow_status' : 'status'
  const positions = existing.map((f) => f.position ?? 0)
  const position = (positions.length > 0 ? Math.min(...positions) : 0) - 1
  const { data: created, error } = await supabase.from('fields').insert({
    organization_id: organizationId,
    board_id: boardId,
    name: 'Status',
    slug,
    field_type: 'status',
    config: { options: defaultStatusOptions() },
    position,
    is_default_status: true,
  }).select('id').maybeSingle()
  if (error) {
    // Unique-index race: a default already exists — return it.
    const { data: now } = await supabase.from('fields').select('id').eq('board_id', boardId).eq('is_default_status', true).maybeSingle()
    return now?.id ?? null
  }
  return created?.id ?? null
}
