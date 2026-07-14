'use server'

// ─────────────────────────────────────────────────────────────────────────
// Gated batch PR 10D — lead-source option refresh (per-board ADMIN ACTION).
//
// Approved mechanism (batch plan §2C, Q6–Q7): an idempotent, admin-only,
// per-field action that rewrites ONE lead_source field's `config.options`
// to the canonical 15 using the UNION strategy — canonical labels first
// (existing option ids preserved when the label already exists), then any
// existing non-canonical options, then any values actually stored on that
// board's records that would otherwise become un-reselectable.
//
// Guarantees:
// • `field_values` are NEVER read-modified or written — stored record
//   values are untouched by design; only the field's option list changes.
// • The previous option list is snapshotted into `config.previous_options`
//   before every refresh, and `restoreLeadSourceOptions` swaps it back —
//   per-field rollback with nothing lost (restore is itself reversible).
// • Slug-guarded: refuses to touch any field whose slug isn't
//   `lead_source`, and only fields inside the caller's own org (RLS +
//   explicit org check).
// • No schema changes — this updates the existing `fields.config` JSON
//   through the same table the app already manages fields in.
// ─────────────────────────────────────────────────────────────────────────

import { requireOrgRole } from '@/features/auth/guards'
import { LEAD_SOURCE_LABELS } from '@/features/production-plan/calc'

type Option = { id: string; label: string }

// Same id scheme ensureLeadSourceField uses — ids for unchanged labels stay
// byte-identical so nothing referencing an option id can drift.
const optionId = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, '_')
const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

type FieldRow = { id: string; board_id: string; slug: string; organization_id: string; config: Record<string, unknown> | null }

async function loadLeadSourceField(fieldId: string) {
  const { supabase, orgId } = await requireOrgRole('admin')
  const { data, error } = await supabase
    .from('fields')
    .select('id, board_id, slug, organization_id, config')
    .eq('id', fieldId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const field = data as FieldRow | null
  if (!field || field.organization_id !== orgId) throw new Error('Field not found')
  if (field.slug !== 'lead_source') throw new Error('Refusing to touch a non-lead_source field')
  return { supabase, field }
}

const readOptions = (config: Record<string, unknown> | null, key: 'options' | 'previous_options'): Option[] => {
  const raw = (config ?? {})[key]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((o): o is Option => !!o && typeof o === 'object' && typeof (o as Option).label === 'string')
    .map((o) => ({ id: typeof o.id === 'string' && o.id ? o.id : optionId(o.label), label: o.label }))
}

export type RefreshResult = {
  totalOptions: number
  canonicalAdded: number
  legacyKept: number
  storedValuesRescued: number
}

/** Rewrite ONE board's lead_source option list to canonical-15 ∪ existing ∪
 *  stored values (admin-only, snapshot kept). Values are never touched. */
export async function refreshLeadSourceOptions(fieldId: string): Promise<RefreshResult> {
  const { supabase, field } = await loadLeadSourceField(fieldId)
  const existing = readOptions(field.config, 'options')

  // Distinct values actually stored on this field's records — anything not
  // already selectable is appended so it can always be re-picked.
  const { data: fvs, error: fvErr } = await supabase
    .from('field_values')
    .select('value_text')
    .eq('field_id', fieldId)
    .not('value_text', 'is', null)
    .limit(2000)
  if (fvErr) throw new Error(fvErr.message)
  const storedValues = [...new Set(
    ((fvs ?? []) as { value_text: string | null }[])
      .map((v) => v.value_text?.trim())
      .filter((v): v is string => !!v),
  )]

  const existingByNorm = new Map(existing.map((o) => [normalize(o.label), o]))
  const canonicalNorms = new Set(LEAD_SOURCE_LABELS.map(normalize))

  // 1. Canonical 15 first — reuse the existing option object (id preserved)
  //    when that label is already on the list.
  let canonicalAdded = 0
  const canonical: Option[] = LEAD_SOURCE_LABELS.map((label) => {
    const hit = existingByNorm.get(normalize(label))
    if (!hit) canonicalAdded += 1
    return hit ?? { id: optionId(label), label }
  })

  // 2. Existing non-canonical options kept as-is (original order).
  const legacy = existing.filter((o) => !canonicalNorms.has(normalize(o.label)))

  // 3. Stored record values selectable nowhere above get appended.
  const listedNorms = new Set([...canonical, ...legacy].map((o) => normalize(o.label)))
  const rescued: Option[] = []
  for (const v of storedValues) {
    const n = normalize(v)
    if (listedNorms.has(n)) continue
    listedNorms.add(n)
    rescued.push({ id: optionId(v), label: v })
  }

  const options = [...canonical, ...legacy, ...rescued]
  const newConfig = {
    ...(field.config ?? {}),
    options,
    previous_options: existing,
    options_refreshed_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('fields').update({ config: newConfig }).eq('id', field.id)
  if (error) throw new Error(error.message)

  return {
    totalOptions: options.length,
    canonicalAdded,
    legacyKept: legacy.length,
    storedValuesRescued: rescued.length,
  }
}

/** Swap `config.previous_options` back in (and keep the current list as the
 *  new snapshot, so a restore can itself be undone). Values untouched. */
export async function restoreLeadSourceOptions(fieldId: string): Promise<{ totalOptions: number }> {
  const { supabase, field } = await loadLeadSourceField(fieldId)
  const previous = readOptions(field.config, 'previous_options')
  if (previous.length === 0) throw new Error('No saved option snapshot to restore')
  const current = readOptions(field.config, 'options')
  const newConfig = {
    ...(field.config ?? {}),
    options: previous,
    previous_options: current,
    options_restored_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('fields').update({ config: newConfig }).eq('id', field.id)
  if (error) throw new Error(error.message)
  return { totalOptions: previous.length }
}
