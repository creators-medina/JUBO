// ─────────────────────────────────────────────────────────────────────────
// Common field registry — server helper (Phase 36B).
//
// Conservative auto-assignment of common_field_key_id for newly created fields
// (imports + create-board-from-file), using the SAME allowlist + type matrix +
// per-board duplicate guard + audit logging as the migration backfill. Takes a
// caller-supplied Supabase client; never touches field_values.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { allowlistKeyForName, isTypeCompatible, isFieldEligibleForCommon } from './commonFields'

type NewField = { id: string; name: string; field_type: string; is_default_status?: boolean }

/**
 * For each newly created field, assign a common key when (and only when) the name
 * exactly matches the allowlist, the type is compatible, the field is eligible,
 * and no other field on the board already holds that key. Every field gets an
 * audit row (source='import'). Idempotent via the audit unique(field_id, source)
 * and the per-board duplicate guard.
 */
export async function autoAssignCommonKeys(
  supabase: SupabaseClient,
  input: { organizationId: string; boardId: string; fields: NewField[] },
): Promise<void> {
  if (input.fields.length === 0) return

  // Registry for this org.
  const { data: keys } = await supabase
    .from('common_field_keys')
    .select('id, key, data_type')
    .eq('organization_id', input.organizationId)
  const keyByName = new Map((keys ?? []).map((k: { id: string; key: string; data_type: string }) => [k.key, k]))

  // Keys already claimed on this board (so we never double-map).
  const { data: existing } = await supabase
    .from('fields')
    .select('common_field_key_id')
    .eq('board_id', input.boardId)
    .not('common_field_key_id', 'is', null)
  const used = new Set<string>((existing ?? []).map((f: { common_field_key_id: string }) => f.common_field_key_id))

  const audit: Array<{ field_id: string; organization_id: string; board_id: string; field_name: string; field_type: string; matched_key: string | null; reason: string; source: string }> = []

  for (const f of input.fields) {
    let matched: string | null = null
    let reason: string

    if (!isFieldEligibleForCommon(f)) {
      reason = f.field_type === 'checklist' ? 'excluded: checklist' : 'excluded: default workflow status'
    } else {
      const key = allowlistKeyForName(f.name)
      if (!key) {
        reason = 'no allowlist match'
      } else {
        const reg = keyByName.get(key)
        if (!reg) {
          reason = 'no registry key'
        } else if (!isTypeCompatible(f.field_type, reg.data_type)) {
          reason = `type incompatible: ${f.field_type} vs ${reg.data_type}`
        } else if (used.has(reg.id)) {
          reason = 'skipped: duplicate key on board'
        } else {
          const { error } = await supabase.from('fields').update({ common_field_key_id: reg.id }).eq('id', f.id)
          if (error) { reason = `error: ${error.message}` }
          else { used.add(reg.id); matched = key; reason = 'exact allowlist match' }
        }
      }
    }

    audit.push({
      field_id: f.id, organization_id: input.organizationId, board_id: input.boardId,
      field_name: f.name, field_type: f.field_type, matched_key: matched, reason, source: 'import',
    })
  }

  if (audit.length > 0) {
    await supabase.from('common_field_backfill_audit').upsert(audit, { onConflict: 'field_id,source' })
  }
}
