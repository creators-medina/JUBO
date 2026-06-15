// ─────────────────────────────────────────────────────────────────────────
// Checklist engine (Phase 35E.1).
//
// A checklist item is a real field of field_type='checklist' (a checkbox stored
// in value_boolean). A group's checklist = the checklist fields VISIBLE in that
// group (reusing the Phase 35B visibility engine). Completion = checked / total.
// One field value powers both the board grid checkbox and the record's
// Checklist tab — one source of truth, two views.
//
// field_requirements (Phase 35E) is preserved for future validation use but no
// longer drives the checklist; the requirement helpers below remain exported.
// ─────────────────────────────────────────────────────────────────────────

import { isFieldVisibleInGroup, type VisibilityIndex } from './visibility'

export type FieldValueLike = {
  value_text?: string | null
  value_number?: number | null
  value_boolean?: boolean | null
  value_date?: string | null
  value_json?: unknown
}

export type ChecklistFieldLike = { id: string; name?: string; field_type: string }

export type ChecklistItem = { fieldId: string; name: string; complete: boolean }

export type ChecklistProgress = {
  items: ChecklistItem[]
  totalCount: number
  completedCount: number
  /** 0–100, rounded. 0 when the group has no checklist fields. */
  percentage: number
  /** True when the group has at least one (visible) checklist field. */
  hasChecklist: boolean
  /** True when there is a checklist and every item is checked. */
  isComplete: boolean
}

/** A checklist item is "done" when its boolean value is checked. */
export function isChecklistChecked(fv?: FieldValueLike | null): boolean {
  return fv?.value_boolean === true
}

/** Whether a field is a checklist field. */
export function isChecklistFieldType(fieldType: string): boolean {
  return fieldType === 'checklist'
}

/** The checklist fields visible in a group, in input order. */
export function groupChecklistFields<T extends ChecklistFieldLike>(
  fields: T[],
  groupId: string | null,
  visibilityIndex: VisibilityIndex,
): T[] {
  if (!groupId) return []
  return fields.filter(
    (f) => isChecklistFieldType(f.field_type) && isFieldVisibleInGroup(f.id, groupId, visibilityIndex),
  )
}

/** Compute a record's checklist completion for its group from its field values. */
export function computeGroupChecklist(
  fields: ChecklistFieldLike[],
  groupId: string | null,
  visibilityIndex: VisibilityIndex,
  valuesByFieldId: Map<string, FieldValueLike> | Record<string, FieldValueLike>,
): ChecklistProgress {
  const getVal = (id: string): FieldValueLike | undefined =>
    valuesByFieldId instanceof Map ? valuesByFieldId.get(id) : valuesByFieldId[id]

  const items: ChecklistItem[] = groupChecklistFields(fields, groupId, visibilityIndex).map((f) => ({
    fieldId: f.id,
    name: f.name ?? '',
    complete: isChecklistChecked(getVal(f.id)),
  }))

  const totalCount = items.length
  const completedCount = items.filter((i) => i.complete).length
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)
  return {
    items,
    totalCount,
    completedCount,
    percentage,
    hasChecklist: totalCount > 0,
    isComplete: totalCount > 0 && completedCount === totalCount,
  }
}

// ── Preserved requirement helpers (Phase 35E — no longer drive the checklist) ──

export type RequirementRow = { field_id: string; group_id: string; is_required?: boolean }

/** Build a groupId → Set<fieldId> lookup of required fields (for future validation). */
export function buildRequirementIndex(rows: RequirementRow[] | null | undefined): Map<string, Set<string>> {
  const byGroup = new Map<string, Set<string>>()
  for (const r of rows ?? []) {
    if (!r?.field_id || !r?.group_id) continue
    if (r.is_required === false) continue
    const set = byGroup.get(r.group_id) ?? new Set<string>()
    set.add(r.field_id)
    byGroup.set(r.group_id, set)
  }
  return byGroup
}
