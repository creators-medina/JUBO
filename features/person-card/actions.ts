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
import { getTwilioConfig, getThreadForRecord } from '@/features/conversations/queries'
import { loadThreadMessages } from '@/features/conversations/actions'
import type { CommunicateContext } from '@/features/communications/communicate'
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
  return assemblePersonCardData({ rec, fieldRows, fieldsById, boardsById, group, keys, owner, tasks, activities, checklist })
}

// Pure assembler — turns the already-fetched rows into the PersonCardData shape.
// Extracted (Phase C4) so getPersonCardData AND the consolidated getFileCardData
// produce byte-identical output from ONE set of queries.
function assemblePersonCardData({
  rec, fieldRows, fieldsById, boardsById, group, keys, owner, tasks, activities, checklist,
}: {
  rec: any
  fieldRows: FieldValueRow[]
  fieldsById: Map<string, any>
  boardsById: Map<string, any>
  group: any | null
  keys: any[] | null
  owner: any | null
  tasks: any[] | null
  activities: any[] | null
  checklist: { fields: { id: string; name: string }[] } | null
}): PersonCardData {
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

// ─────────────────────────────────────────────────────────────────────────
// Phase C3 — current-board "command" bundle for the loan-shape Overview.
//
// The harvested LOS pieces (NextActionCard, computeOpportunitySignals,
// ParticipantRibbon, Move-To, and the slug accessors that bind the Loan
// Snapshot / File Summary to REAL stored values) all read the `MortgageData`
// shape. This resolver returns exactly that for the record's CURRENT board —
// the same query shape the old WorkspacePanel.load used, scoped to one board.
// (Read-only; nothing here writes. Data-path dedup with getPersonCardData /
// getCommunicateContext is deferred to C4.)
// ─────────────────────────────────────────────────────────────────────────

export type LoanCommandData = MortgageData & { profiles: Record<string, string> }

export async function getLoanCommandData(recordId: string): Promise<LoanCommandData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: record } = await supabase.from('records').select('*').eq('id', recordId).maybeSingle()
  if (!record) return null

  const [fieldsRes, fvRes, aRes, tRes, mRes, gRes, nRes, bRes, cRes] = await Promise.all([
    supabase.from('fields').select('*').eq('board_id', record.board_id).order('position'),
    supabase.from('field_values').select('*').eq('record_id', recordId),
    supabase.from('activities').select('*').eq('record_id', recordId).order('created_at', { ascending: false }).limit(40),
    supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
    supabase.from('record_movements').select('*, from_group:from_group_id(name), to_group:to_group_id(name)').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20),
    supabase.from('board_groups').select('*').eq('board_id', record.board_id).eq('is_archived', false).order('position'),
    supabase.from('notes').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
    supabase.from('boards').select('id, name, slug, board_type').eq('id', record.board_id).maybeSingle(),
    supabase.from('communication_logs').select('*').eq('record_id', recordId).order('occurred_at', { ascending: false }),
  ])

  // Resolve actor names (used by ParticipantRibbon's Loan-Officer fallback).
  const userIds = new Set<string>()
  if (record.owner_user_id) userIds.add(record.owner_user_id)
  for (const a of aRes.data ?? []) if (a.user_id) userIds.add(a.user_id)
  for (const t of tRes.data ?? []) { if (t.created_by) userIds.add(t.created_by); if (t.assigned_user_id) userIds.add(t.assigned_user_id) }
  const profiles: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name').in('id', [...userIds])
    for (const p of profs ?? []) profiles[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  }

  return {
    record,
    board: bRes.data ?? null,
    fields: fieldsRes.data ?? [],
    fieldValues: fvRes.data ?? [],
    activities: aRes.data ?? [],
    tasks: tRes.data ?? [],
    movements: mRes.data ?? [],
    notes: nRes.data ?? [],
    groups: gRes.data ?? [],
    communications: cRes.data ?? [],
    profiles,
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phase C4 — ONE resolver for the File Card open.
//
// Opening a loan record used to fire three overlapping resolvers
// (getPersonCardData + getCommunicateContext + getLoanCommandData), re-reading
// record / fields / field_values / activities / tasks / notes / communications
// 2–3× each. getFileCardData reads every underlying table ONCE and returns the
// same three shapes the card already consumes ({ card, comms, loan }), so the
// rendered output is byte-identical — this only changes HOW data is fetched.
// (The legacy resolvers above are kept for their other callers, e.g.
// CommunicateView; the card now calls only this one.)
// ─────────────────────────────────────────────────────────────────────────

type CommsBundle = NonNullable<CommunicateContext>
export type FileCardData = { card: PersonCardData; comms: CommsBundle; loan: LoanCommandData }

export async function getFileCardData(recordId: string): Promise<FileCardData | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // C4-FIX — classify fetches: the RECORD is the only REQUIRED read; everything
  // else is OPTIONAL and must degrade to []/null/placeholder, never null the
  // whole card. `safe` swallows a rejected optional fetch (missing thread, no
  // twilio config, RLS-empty, null board/group, …) so one absent relationship
  // can't abort the bundle — matching the old three-resolver tolerance.
  const safe = async (p: PromiseLike<any>, fallback: any): Promise<any> => {
    try { return await p } catch { return fallback }
  }
  const EMPTY = { data: [] as any[] }

  // Record once — the full row covers every consumer (ids, owner, status,
  // next_action*, record_type). REQUIRED: a truly-missing record → "unavailable".
  const recRes = await safe(supabase.from('records').select('*').eq('id', recordId).maybeSingle(), { data: null as any })
  const rec = recRes.data
  if (!rec) return null
  const orgId = rec.organization_id as string
  const boardId = rec.board_id as string | null

  // Every field value the record holds (current + stranded), once. [OPTIONAL]
  const fvs = (await safe(supabase
    .from('field_values')
    .select('field_id, value_text, value_number, value_boolean, value_date, value_json, updated_at')
    .eq('record_id', recordId), EMPTY)).data
  const fieldRows = (fvs ?? []) as FieldValueRow[]
  const fieldIds = [...new Set(fieldRows.map((v) => v.field_id))]

  // Field metadata for those values (incl slug, for the loan slug accessors). [OPTIONAL]
  const fieldsData = (fieldIds.length > 0
    ? (await safe(supabase.from('fields').select('id, board_id, name, field_type, slug, position, common_field_key_id').in('id', fieldIds), EMPTY)).data
    : []) as any[]
  const fieldsById = new Map((fieldsData ?? []).map((f: any) => [f.id, f]))

  // Boards (current + every referenced). [OPTIONAL]
  const boardIds = [...new Set([boardId, ...(fieldsData ?? []).map((f: any) => f.board_id)].filter(Boolean))] as string[]
  const boardsData = (boardIds.length > 0
    ? (await safe(supabase.from('boards').select('id, name, board_type, slug, color').in('id', boardIds), EMPTY)).data
    : []) as any[]
  const boardsById = new Map((boardsData ?? []).map((b: any) => [b.id, b]))

  // Remaining record-scoped reads — each table ONCE, each independently guarded
  // so a single rejection (e.g. no thread, twilio not configured) can't null the
  // card. [ALL OPTIONAL]
  const [
    groupsR, keysR, tasksR, activitiesR, movementsR, notesR, communicationsR, memsR,
    checklist, twilioConfig, thread,
  ] = await Promise.all([
    safe(boardId ? supabase.from('board_groups').select('*').eq('board_id', boardId).eq('is_archived', false).order('position') : Promise.resolve(EMPTY), EMPTY),
    safe(supabase.from('common_field_keys').select('id, key, label, scope, data_type').eq('organization_id', orgId), EMPTY),
    safe(supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: false }), EMPTY),
    safe(supabase.from('activities').select('id, activity_type, content, metadata, created_at, user_id').eq('record_id', recordId).order('created_at', { ascending: false }).limit(100), EMPTY),
    safe(supabase.from('record_movements').select('id, created_at').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20), EMPTY),
    safe(supabase.from('notes').select('*').eq('record_id', recordId).order('created_at', { ascending: false }), EMPTY),
    safe(supabase.from('communication_logs').select('*').eq('record_id', recordId).order('occurred_at', { ascending: false }), EMPTY),
    safe(supabase.from('organization_members').select('user_id, status, profiles:user_id(first_name, last_name, email)').eq('organization_id', orgId), EMPTY),
    safe(boardId ? getGroupChecklistFields(boardId, (rec.group_id as string | null)) : Promise.resolve({ fields: [] as { id: string; name: string }[] }), { fields: [] as { id: string; name: string }[] }),
    safe(getTwilioConfig(supabase as never, orgId), null),
    safe(getThreadForRecord(recordId), null),
  ])
  const groups = groupsR.data
  const keys = keysR.data
  const tasks = tasksR.data
  const activities = activitiesR.data
  const movements = movementsR.data
  const notes = notesR.data
  const communications = communicationsR.data
  const mems = memsR.data

  // Profiles for owner + actors (names). [OPTIONAL]
  const userIds = new Set<string>()
  if (rec.owner_user_id) userIds.add(rec.owner_user_id)
  for (const a of activities ?? []) if (a.user_id) userIds.add(a.user_id)
  for (const t of tasks ?? []) { if (t.created_by) userIds.add(t.created_by); if (t.assigned_user_id) userIds.add(t.assigned_user_id) }
  const profileRows = userIds.size > 0
    ? ((await safe(supabase.from('profiles').select('id, first_name, last_name, email').in('id', [...userIds]), EMPTY)).data ?? [])
    : []
  const profiles: Record<string, string> = {}
  for (const p of profileRows as any[]) profiles[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
  const owner = (profileRows as any[]).find((p) => p.id === rec.owner_user_id) ?? null

  const group = (groups ?? []).find((g: any) => g.id === rec.group_id) ?? null

  // ── card: the cross-board read model (identical to getPersonCardData). ──
  const card = assemblePersonCardData({ rec, fieldRows, fieldsById, boardsById, group, keys, owner, tasks, activities, checklist })

  // ── loan: the current-board MortgageData bundle (identical to getLoanCommandData). ──
  const curBoard = boardId ? boardsById.get(boardId) ?? null : null
  const loan: LoanCommandData = {
    record: rec,
    board: curBoard ? { id: curBoard.id, name: curBoard.name, slug: curBoard.slug, board_type: curBoard.board_type } : null,
    fields: (fieldsData ?? []).filter((f: any) => f.board_id === boardId),
    fieldValues: fieldRows as any[],
    activities: (activities ?? []) as any[],
    tasks: (tasks ?? []) as any[],
    movements: (movements ?? []) as any[],
    notes: (notes ?? []) as any[],
    groups: (groups ?? []) as any[],
    communications: (communications ?? []) as any[],
    profiles,
  }

  // ── comms: contact identity + SMS thread + notes + members (identical to
  //    getCommunicateContext). ──
  const threadId = thread?.id ?? null
  const messages = threadId ? await safe(loadThreadMessages(threadId), [] as any[]) : []
  const phoneKeyId = (keys ?? []).find((k: any) => k.key === 'phone')?.id ?? null
  const emailKeyId = (keys ?? []).find((k: any) => k.key === 'email')?.id ?? null
  const curFields = (fieldsData ?? []).filter((f: any) => f.board_id === boardId)
  const valText = new Map<string, string>()
  for (const fv of fieldRows) if (fv.value_text) valText.set(fv.field_id, fv.value_text)
  const pickContact = (keyId: string | null, type: string): string | null => {
    if (keyId) { const f = curFields.find((x: any) => x.common_field_key_id === keyId && valText.has(x.id)); if (f) return valText.get(f.id)! }
    const f2 = curFields.find((x: any) => x.field_type === type && valText.has(x.id)); return f2 ? valText.get(f2.id)! : null
  }
  const members = ((mems ?? []) as any[])
    .filter((m) => m.status !== 'disabled' && m.user_id)
    .map((m) => {
      const p = m.profiles ?? {}
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || 'Member'
      return { id: m.user_id as string, name }
    })
  const comms: CommsBundle = {
    twilioConnected: !!twilioConfig,
    phone: pickContact(phoneKeyId, 'phone'),
    email: pickContact(emailKeyId, 'email'),
    threadId,
    messages,
    notes: (notes ?? []) as any,
    members,
    currentUserId: user.id,
  }

  return { card, comms, loan }
}
