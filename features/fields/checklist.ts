// ─────────────────────────────────────────────────────────────────────────
// Checklist engine (Phase 35E).
//
// A group's checklist = the fields that are REQUIRED for that group AND visible
// in it (a field hidden in a group never counts). Completion is computed purely
// from field_values — there is no separate checklist table or completion state.
//
// Pure helpers shared by server + client. Boards with no requirement rows have
// no checklists (requiredCount 0) → identical to pre-35E behavior.
// ─────────────────────────────────────────────────────────────────────────

import { isFieldVisibleInGroup, type VisibilityIndex } from './visibility'

export type RequirementRow = { field_id: string; group_id: string; is_required?: boolean }

export type FieldValueLike = {
  value_text?: string | null
  value_number?: number | null
  value_boolean?: boolean | null
  value_date?: string | null
  value_json?: unknown
}

export type ChecklistFieldLike = { id: string; name?: string; field_type: string }

export type ChecklistItem = { fieldId: string; name: string; fieldType: string; complete: boolean }

export type ChecklistProgress = {
  items: ChecklistItem[]
  requiredCount: number
  completedCount: number
  /** 0–100, rounded. 0 when nothing is required. */
  percentage: number
  /** True when the group has at least one required+visible field. */
  hasChecklist: boolean
  /** True when there is a checklist and every item is complete. */
  isComplete: boolean
}

/** Per the Phase 35E completion rules: a value "exists" by field type. Null = incomplete. */
export function isValueComplete(fieldType: string, fv?: FieldValueLike | null): boolean {
  if (!fv) return false
  const hasText = typeof fv.value_text === 'string' && fv.value_text.trim() !== ''
  const hasNumber = fv.value_number !== null && fv.value_number !== undefined
  const hasDate = (typeof fv.value_date === 'string' && fv.value_date.trim() !== '') || hasText
  const jsonLen = Array.isArray(fv.value_json) ? fv.value_json.length : 0

  switch (fieldType) {
    case 'boolean':
      return fv.value_boolean === true
    case 'number':
    case 'currency':
    case 'rating':
      return hasNumber
    case 'date':
    case 'datetime':
      return hasDate
    case 'multiselect':
    case 'tags':
      return jsonLen > 0 || hasText
    case 'status':
    case 'select':
      return hasText
    default:
      // text, textarea, email, phone, url, formula, relation, user…
      return hasText
  }
}

/** Build a groupId → Set<fieldId> lookup of required fields. */
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

/** Ids of fields that are required AND visible in a group (the actual checklist). */
export function checklistFieldIds<T extends { id: string }>(
  fields: T[],
  groupId: string | null,
  requirementIndex: Map<string, Set<string>>,
  visibilityIndex: VisibilityIndex,
): string[] {
  if (!groupId) return []
  const required = requirementIndex.get(groupId)
  if (!required || required.size === 0) return []
  return fields
    .filter((f) => required.has(f.id) && isFieldVisibleInGroup(f.id, groupId, visibilityIndex))
    .map((f) => f.id)
}

/** Compute completion for a record's group from its field values. */
export function computeChecklistProgress(
  fields: ChecklistFieldLike[],
  groupId: string | null,
  requirementIndex: Map<string, Set<string>>,
  visibilityIndex: VisibilityIndex,
  valuesByFieldId: Map<string, FieldValueLike> | Record<string, FieldValueLike>,
): ChecklistProgress {
  const getVal = (id: string): FieldValueLike | undefined =>
    valuesByFieldId instanceof Map ? valuesByFieldId.get(id) : valuesByFieldId[id]

  const ids = new Set(checklistFieldIds(fields, groupId, requirementIndex, visibilityIndex))
  const items: ChecklistItem[] = fields
    .filter((f) => ids.has(f.id))
    .map((f) => ({
      fieldId: f.id,
      name: f.name ?? '',
      fieldType: f.field_type,
      complete: isValueComplete(f.field_type, getVal(f.id)),
    }))

  const requiredCount = items.length
  const completedCount = items.filter((i) => i.complete).length
  const percentage = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100)
  return {
    items,
    requiredCount,
    completedCount,
    percentage,
    hasChecklist: requiredCount > 0,
    isComplete: requiredCount > 0 && completedCount === requiredCount,
  }
}
