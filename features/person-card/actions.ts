'use server'

// ─────────────────────────────────────────────────────────────────────────
// Person Card V1 resolver (Phase 36D-1) — READ-ONLY cross-board projection.
//
// getPersonCardData(recordId) is the ONLY source of Person Card data. It does
// its OWN cross-board queries (it deliberately does NOT use useWorkspaceData /
// any current-board-only loader, which structurally can't see stranded values).
// A record keeps its record_id through every move and its field_values persist
// when it leaves a board, so reading all field_values for the record — joined to
// their fields' common_field_key_id — recovers every common value the record
// ever held, across every board. Nothing here writes.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { getGroupChecklistFields } from '@/features/fields/actions'
import { valueIsEmpty } from '@/features/fields/conversion'
import { resolveTemplateKey } from '@/features/mortgage/templates/resolve'
import type { MortgageData, WorkspaceTemplateKey } from '@/features/mortgage/types'

type FieldValueRow = {
  field_id: string
  value_text: string | null
  value_number: number | null
  value_boolean: boolean | null
  value_date: string | null
  value_json: unknown
  updated_at: string
}

function formatFieldValue(fieldType: string, fv: FieldValueRow): string {
  switch (fieldType) {
    case 'currency':
      return fv.value_number != null ? `$${Number(fv.value_number).toLocaleString()}` : ''
    case 'number':
    case 'rating':
      return fv.value_number != null ? String(fv.value_number) : ''
    case 'boolean':
    case 'checklist':
      return fv.value_boolean === true ? 'Yes' : fv.value_boolean === false ? 'No' : ''
    case 'date':
    case 'datetime':
      return fv.value_date ? fv.value_date.split('T')[0] : (fv.value_text ?? '')
    case 'multiselect':
    case 'tags':
      return Array.isArray(fv.value_json) ? (fv.value_json as unknown[]).join(', ') : (fv.value_text ?? '')
    default:
      return fv.value_text ?? '' // text/textarea/email/phone/url/select/status…
  }
}

export type PersonCardCommon = {
  key: string
  label: string
  scope: string
  dataType: string
  value: string
  sourceBoardId: string | null
  sourceBoardName: string | null
  conflictCount: number
  allValues: { value: string; boardId: string | null; boardName: string }[]
}

export type PersonCardBoardField = { fieldId: string; name: string; fieldType: string; value: string }

export type PersonCardData = {
  record: {
    id: string; title: string; status: string; priority: string
    organizationId: string; boardId: string | null; groupId: string | null
    createdAt: string; updatedAt: string
  }
  currentBoard: { id: string; name: string; boardType: string; color: string | null } | null
  currentGroup: { id: string; name: string; color: string | null } | null
  // Phase C2 — card shape (loan vs generic) is decided by the EXISTING workspace
  // template resolver, never by board-name matching. 'loan'/'lead' = loan-like.
  templateKey: WorkspaceTemplateKey
  ownerName: string | null
  common: PersonCardCommon[]
  thisBoard: PersonCardBoardField[]
  previousBoards: { boardId: string; boardName: string; fields: PersonCardBoardField[] }[]
  checklist: { items: { fieldId: string; name: string; complete: boolean }[]; completedCount: number; totalCount: number; percentage: number; hasChecklist: boolean }
  tasks: any[]
  activities: { id: string; activity_type: string; content: string | null; metadata: any; created_at: string; user_id: string | null }[]
}

export async function getPersonCardData(recordId: string): Promise<PersonCardData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Record (RLS scopes to the caller's org — foreign records resolve to null).
  const { data: rec } = await supabase
    .from('records')
    .select('id, organization_id, board_id, group_id, title, status, priority, record_type, owner_user_id, created_at, updated_at')
    .eq('id', recordId).maybeSingle()
  if (!rec) return null

  // ── The two load-bearing cross-board queries (batched, no N+1) ──
  // (Q-A) every field value the record holds, on ANY board (current + stranded).
  const { data: fvs } = await supabase
    .from('field_values')
    .select('field_id, value_text, value_number, value_boolean, value_date, value_json, updated_at')
    .eq('record_id', recordId)
  const fieldRows = (fvs ?? []) as FieldValueRow[]
  const fieldIds = [...new Set(fieldRows.map((v) => v.field_id))]

  // (Q-B) field metadata for those values (board, key, type) — one query.
  const { data: fieldsData } = fieldIds.length > 0
    ? await supabase.from('fields').select('id, board_id, name, field_type, position, common_field_key_id').in('id', fieldIds)
    : { data: [] as any[] }
  const fieldsById = new Map((fieldsData ?? []).map((f: any) => [f.id, f]))

  // Board names for current + every referenced board (one query).
  const boardIds = [...new Set([rec.board_id, ...(fieldsData ?? []).map((f: any) => f.board_id)].filter(Boolean))] as string[]
  const { data: boardsData } = boardIds.length > 0
    ? await supabase.from('boards').select('id, name, board_type, slug, color').in('id', boardIds)
    : { data: [] as any[] }
  const boardsById = new Map((boardsData ?? []).map((b: any) => [b.id, b]))

  // Current group, common-key registry, owner, tasks, activities, checklist.
  const [{ data: group }, { data: keys }, { data: owner }, { data: tasks }, { data: activities }, checklist] = await Promise.all([
    rec.group_id ? supabase.from('board_groups').select('id, name, color').eq('id', rec.group_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('common_field_keys').select('id, key, label, scope, data_type').eq('organization_id', rec.organization_id),
    rec.owner_user_id ? supabase.from('profiles').select('first_name, last_name, email').eq('id', rec.owner_user_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
    supabase.from('activities').select('id, activity_type, content, metadata, created_at, user_id').eq('record_id', recordId).order('created_at', { ascending: false }).limit(100),
    // Reuse the existing checklist engine with explicit current-group context.
    getGroupChecklistFields(rec.board_id as string, rec.group_id as string | null),
  ])
  const keysById = new Map((keys ?? []).map((k: any) => [k.id, k]))

  // ── Common-field resolution (display-only; conflicts surfaced, never resolved) ──
  const byKey = new Map<string, { fv: FieldValueRow; field: any }[]>()
  for (const fv of fieldRows) {
    const field = fieldsById.get(fv.field_id)
    if (!field || !field.common_field_key_id) continue
    if (valueIsEmpty(fv)) continue
    const arr = byKey.get(field.common_field_key_id) ?? []
    arr.push({ fv, field })
    byKey.set(field.common_field_key_id, arr)
  }

  const common: PersonCardCommon[] = []
  for (const [keyId, entries] of byKey) {
    const key = keysById.get(keyId)
    if (!key) continue
    // 1) current board, 2) most-recently-updated, 3) first.
    const current = entries.find((e) => e.field.board_id === rec.board_id)
    const byRecency = [...entries].sort((a, b) => (b.fv.updated_at ?? '').localeCompare(a.fv.updated_at ?? ''))
    const sel = current ?? byRecency[0] ?? entries[0]
    const allValues = entries.map((e) => ({
      value: formatFieldValue(e.field.field_type, e.fv),
      boardId: e.field.board_id,
      boardName: boardsById.get(e.field.board_id)?.name ?? 'Unknown board',
    }))
    const distinct = new Set(allValues.map((a) => a.value))
    common.push({
      key: key.key, label: key.label, scope: key.scope, dataType: key.data_type,
      value: formatFieldValue(sel.field.field_type, sel.fv),
      sourceBoardId: sel.field.board_id,
      sourceBoardName: boardsById.get(sel.field.board_id)?.name ?? null,
      conflictCount: distinct.size,
      allValues,
    })
  }

  // ── Board-specific (non-common) values: This Board vs Previous Board Data ──
  const thisBoard: PersonCardBoardField[] = []
  const prevByBoard = new Map<string, PersonCardBoardField[]>()
  const prevPos = new Map<string, Map<string, number>>()
  for (const fv of fieldRows) {
    const field = fieldsById.get(fv.field_id)
    if (!field || field.common_field_key_id) continue
    if (field.field_type === 'checklist') continue // shown in the checklist section
    if (valueIsEmpty(fv)) continue
    const item: PersonCardBoardField = { fieldId: field.id, name: field.name, fieldType: field.field_type, value: formatFieldValue(field.field_type, fv) }
    if (field.board_id === rec.board_id) {
      thisBoard.push(item)
    } else if (field.board_id) {
      const arr = prevByBoard.get(field.board_id) ?? []
      arr.push(item)
      prevByBoard.set(field.board_id, arr)
      const pm = prevPos.get(field.board_id) ?? new Map()
      pm.set(field.id, field.position ?? 0)
      prevPos.set(field.board_id, pm)
    }
  }
  // sort This Board by field position
  thisBoard.sort((a, b) => ((fieldsById.get(a.fieldId)?.position ?? 0) - (fieldsById.get(b.fieldId)?.position ?? 0)))
  const previousBoards = [...prevByBoard.entries()].map(([boardId, fields]) => ({
    boardId,
    boardName: boardsById.get(boardId)?.name ?? 'Previous board',
    fields: fields.sort((a, b) => ((prevPos.get(boardId)?.get(a.fieldId) ?? 0) - (prevPos.get(boardId)?.get(b.fieldId) ?? 0))),
  }))

  // ── Checklist (current group only; completion from already-loaded values) ──
  const valueByFieldId = new Map(fieldRows.map((v) => [v.field_id, v]))
  const clItems = (checklist?.fields ?? []).map((f: { id: string; name: string }) => ({
    fieldId: f.id, name: f.name, complete: valueByFieldId.get(f.id)?.value_boolean === true,
  }))
  const completedCount = clItems.filter((i) => i.complete).length
  const totalCount = clItems.length

  const ownerName = owner
    ? [(owner as any).first_name, (owner as any).last_name].filter(Boolean).join(' ').trim() || (owner as any).email || null
    : null

  // Card shape — reuse the existing workspace template resolver (board_type /
  // record_type / slug). Loan-like boards (loan/lead) get the loan File Card;
  // everything else (generic/partner/past_client) gets the generic card.
  const curBoard = rec.board_id ? boardsById.get(rec.board_id) : null
  const templateKey = resolveTemplateKey({
    record: { record_type: (rec as any).record_type ?? null },
    board: curBoard ? { board_type: curBoard.board_type, slug: curBoard.slug } : null,
  } as unknown as MortgageData)

  return {
    record: {
      id: rec.id, title: rec.title, status: rec.status, priority: rec.priority,
      organizationId: rec.organization_id, boardId: rec.board_id, groupId: rec.group_id,
      createdAt: rec.created_at, updatedAt: rec.updated_at,
    },
    currentBoard: rec.board_id && boardsById.get(rec.board_id)
      ? { id: rec.board_id, name: boardsById.get(rec.board_id).name, boardType: boardsById.get(rec.board_id).board_type, color: boardsById.get(rec.board_id).color }
      : null,
    currentGroup: group ? { id: (group as any).id, name: (group as any).name, color: (group as any).color } : null,
    templateKey,
    ownerName,
    common,
    thisBoard,
    previousBoards,
    checklist: { items: clItems, completedCount, totalCount, percentage: totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100), hasChecklist: totalCount > 0 },
    tasks: tasks ?? [],
    activities: (activities ?? []) as any,
  }
}
