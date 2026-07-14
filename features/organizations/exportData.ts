'use server'

// ─────────────────────────────────────────────────────────────────────────
// Org data export — CSV, admin/owner only, current-org only.
//
// Every read goes through the authed server client, so RLS enforces org
// scoping on every table (records/boards/board_groups/fields/field_values/
// notes/tasks/profiles all carry is_org_member SELECT policies) — no
// service-role, no cross-org joins. We ALSO filter by organization_id
// explicitly (belt-and-suspenders). Read-only: nothing is mutated.
//
// Intentionally EXCLUDED: Twilio/integration/invite tokens or any secrets
// (those tables are never queried here), and SMS/message bodies
// (communication_logs) — message-body export is compliance-sensitive and
// gated to a separate approved PR.
// ─────────────────────────────────────────────────────────────────────────

import { requireOrgRole } from '@/features/auth/guards'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toCsv, fieldValueToString as fieldValue, fullName } from './csv'

export type ExportResult = { ok: true; filename: string; csv: string } | { error: string }

const RECORD_CAP = 10000
const FIELD_VALUE_CAP = 50000
const NOTE_TASK_CAP = 20000

type Ctx = { supabase: SupabaseClient; orgId: string }

async function adminCtx(): Promise<Ctx | { error: string }> {
  try {
    const ctx = await requireOrgRole('admin')
    return { supabase: ctx.supabase as unknown as SupabaseClient, orgId: ctx.orgId }
  } catch (e) {
    return { error: e instanceof Error && e.message === 'Forbidden' ? 'forbidden' : 'unauthorized' }
  }
}

/** Build shared lookups (board names, group names, profile names) for an org. */
async function lookups(supabase: SupabaseClient, orgId: string) {
  const { data: boards } = await supabase.from('boards').select('id, name').eq('organization_id', orgId)
  const boardName = new Map((boards ?? []).map((b) => [b.id as string, b.name as string]))
  const boardIds = (boards ?? []).map((b) => b.id as string)

  const groupName = new Map<string, string>()
  if (boardIds.length) {
    const { data: groups } = await supabase.from('board_groups').select('id, name').in('board_id', boardIds)
    for (const g of groups ?? []) groupName.set(g.id as string, g.name as string)
  }
  return { boardName, groupName }
}

async function profileNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, string>()
  if (!unique.length) return map
  const { data } = await supabase.from('profiles').select('id, first_name, last_name, email').in('id', unique)
  for (const p of data ?? []) map.set(p.id as string, fullName(p))
  return map
}

/** A) Core CRM records — one row per record with contact + metadata columns. */
export async function exportRecordsCsv(): Promise<ExportResult> {
  const ctx = await adminCtx()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  const { boardName, groupName } = await lookups(supabase, orgId)

  const { data: records } = await supabase
    .from('records')
    .select('id, title, board_id, group_id, status, priority, value, owner_user_id, assigned_user_id, created_at, updated_at')
    .eq('organization_id', orgId)
    .eq('is_archived', false)
    .is('parent_record_id', null)
    .order('created_at', { ascending: true })
    .limit(RECORD_CAP)
  const recs = records ?? []
  const recordIds = recs.map((r) => r.id as string)

  // Phone/email for quick contact — resolved from phone/email-typed field values.
  const phoneByRecord = new Map<string, string>()
  const emailByRecord = new Map<string, string>()
  if (recordIds.length) {
    const { data: fields } = await supabase.from('fields').select('id, field_type').eq('organization_id', orgId).in('field_type', ['phone', 'email'])
    const phoneIds = new Set((fields ?? []).filter((f) => f.field_type === 'phone').map((f) => f.id as string))
    const emailIds = new Set((fields ?? []).filter((f) => f.field_type === 'email').map((f) => f.id as string))
    const allIds = [...phoneIds, ...emailIds]
    if (allIds.length) {
      const { data: fvs } = await supabase.from('field_values').select('record_id, field_id, value_text').in('record_id', recordIds).in('field_id', allIds).not('value_text', 'is', null)
      for (const fv of fvs ?? []) {
        const rid = fv.record_id as string
        if (phoneIds.has(fv.field_id as string)) { if (!phoneByRecord.has(rid)) phoneByRecord.set(rid, fv.value_text as string) }
        else if (!emailByRecord.has(rid)) emailByRecord.set(rid, fv.value_text as string)
      }
    }
  }

  const names = await profileNames(supabase, recs.flatMap((r) => [r.owner_user_id as string, r.assigned_user_id as string]))

  const rows = recs.map((r) => [
    boardName.get(r.board_id as string) ?? '',
    r.group_id ? (groupName.get(r.group_id as string) ?? '') : '',
    r.title as string,
    r.status as string,
    r.priority as string,
    names.get(r.owner_user_id as string) ?? '',
    names.get(r.assigned_user_id as string) ?? '',
    phoneByRecord.get(r.id as string) ?? '',
    emailByRecord.get(r.id as string) ?? '',
    r.value != null ? String(r.value) : '',
    r.created_at as string,
    r.updated_at as string,
  ])

  const csv = toCsv(
    ['Board', 'Stage', 'Title', 'Status', 'Priority', 'Owner', 'Assigned To', 'Phone', 'Email', 'Value', 'Created At', 'Updated At'],
    rows,
  )
  return { ok: true, filename: 'jubo-records.csv', csv }
}

/** B) All field values (long format) — complete custom + common field data. */
export async function exportRecordFieldsCsv(): Promise<ExportResult> {
  const ctx = await adminCtx()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  const { boardName } = await lookups(supabase, orgId)

  const { data: records } = await supabase
    .from('records').select('id, title, board_id').eq('organization_id', orgId).eq('is_archived', false).limit(RECORD_CAP)
  const recs = records ?? []
  const recTitle = new Map(recs.map((r) => [r.id as string, r.title as string]))
  const recBoard = new Map(recs.map((r) => [r.id as string, boardName.get(r.board_id as string) ?? '']))
  const recordIds = recs.map((r) => r.id as string)

  const { data: fields } = await supabase.from('fields').select('id, name, field_type').eq('organization_id', orgId)
  const fieldMeta = new Map((fields ?? []).map((f) => [f.id as string, { name: f.name as string, type: f.field_type as string }]))

  const rows: (string | number | null)[][] = []
  if (recordIds.length) {
    const { data: fvs } = await supabase
      .from('field_values')
      .select('record_id, field_id, value_text, value_number, value_boolean, value_date, value_json')
      .in('record_id', recordIds)
      .limit(FIELD_VALUE_CAP)
    for (const fv of fvs ?? []) {
      const meta = fieldMeta.get(fv.field_id as string)
      if (!meta) continue
      const val = fieldValue(fv)
      if (val === '') continue
      rows.push([recBoard.get(fv.record_id as string) ?? '', recTitle.get(fv.record_id as string) ?? '', meta.name, meta.type, val])
    }
  }

  return { ok: true, filename: 'jubo-record-fields.csv', csv: toCsv(['Board', 'Record', 'Field', 'Type', 'Value'], rows) }
}

/** C) Notes + tasks (no message bodies) — one row each, referenced to a record. */
export async function exportNotesTasksCsv(): Promise<ExportResult> {
  const ctx = await adminCtx()
  if ('error' in ctx) return ctx
  const { supabase, orgId } = ctx

  const { boardName } = await lookups(supabase, orgId)
  const { data: records } = await supabase.from('records').select('id, title, board_id').eq('organization_id', orgId).limit(RECORD_CAP)
  const recTitle = new Map((records ?? []).map((r) => [r.id as string, r.title as string]))
  const recBoard = new Map((records ?? []).map((r) => [r.id as string, boardName.get(r.board_id as string) ?? '']))

  const [{ data: notes }, { data: tasks }] = await Promise.all([
    supabase.from('notes').select('record_id, content, author_user_id, created_at').eq('organization_id', orgId).limit(NOTE_TASK_CAP),
    supabase.from('tasks').select('record_id, title, description, due_date, completed_at, created_by, created_at').eq('organization_id', orgId).limit(NOTE_TASK_CAP),
  ])

  const names = await profileNames(supabase, [
    ...(notes ?? []).map((n) => n.author_user_id as string),
    ...(tasks ?? []).map((t) => t.created_by as string),
  ])

  const rows: (string | number | null)[][] = []
  for (const n of notes ?? []) {
    rows.push(['Note', recBoard.get(n.record_id as string) ?? '', recTitle.get(n.record_id as string) ?? '', n.content as string, '', '', names.get(n.author_user_id as string) ?? '', n.created_at as string])
  }
  for (const t of tasks ?? []) {
    const content = [t.title, t.description].filter(Boolean).join(' — ')
    rows.push(['Task', recBoard.get(t.record_id as string) ?? '', recTitle.get(t.record_id as string) ?? '', content, t.completed_at ? 'Completed' : 'Open', (t.due_date as string) ?? '', names.get(t.created_by as string) ?? '', t.created_at as string])
  }

  return { ok: true, filename: 'jubo-notes-tasks.csv', csv: toCsv(['Type', 'Board', 'Record', 'Content', 'Status', 'Due Date', 'Created By', 'Created At'], rows) }
}
