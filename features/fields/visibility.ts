// ─────────────────────────────────────────────────────────────────────────
// Field visibility resolution (Phase 35B).
//
// Pure helpers shared by server + client. The model is opt-in:
//   * A field with NO visibility rows  → common: visible in every group.
//   * A field with ≥1 visibility row   → group-specific: visible ONLY in those.
//
// Boards with no rows resolve every field as common, i.e. identical to the
// pre-35B behavior. Hiding never touches field_values — values are preserved
// and simply not rendered in groups where the field isn't visible.
// ─────────────────────────────────────────────────────────────────────────

export type FieldVisibilityRow = { field_id: string; group_id: string }

export type VisibilityIndex = {
  /** field_id → set of group_ids it's restricted to (empty/absent = common). */
  byField: Map<string, Set<string>>
}

/** Build a lookup from the raw visibility rows. */
export function buildVisibilityIndex(rows: FieldVisibilityRow[] | null | undefined): VisibilityIndex {
  const byField = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (!r?.field_id || !r?.group_id) continue
    const set = byField.get(r.field_id) ?? new Set<string>()
    set.add(r.group_id)
    byField.set(r.field_id, set)
  }
  return { byField }
}

/** A field is common when it has no visibility rows at all. */
export function isCommonField(fieldId: string, index: VisibilityIndex): boolean {
  const set = index.byField.get(fieldId)
  return !set || set.size === 0
}

/** Whether a field should render in a given group. */
export function isFieldVisibleInGroup(fieldId: string, groupId: string, index: VisibilityIndex): boolean {
  const set = index.byField.get(fieldId)
  if (!set || set.size === 0) return true // common → everywhere
  return set.has(groupId)                  // group-specific → only listed groups
}

/** Resolve the ordered list of fields visible in a group (preserves input order). */
export function resolveVisibleFields<T extends { id: string }>(
  fields: T[],
  groupId: string,
  index: VisibilityIndex,
): T[] {
  return fields.filter((f) => isFieldVisibleInGroup(f.id, groupId, index))
}

/** Ids of all common (board-wide) fields. */
export function commonFieldIds<T extends { id: string }>(fields: T[], index: VisibilityIndex): string[] {
  return fields.filter((f) => isCommonField(f.id, index)).map((f) => f.id)
}
