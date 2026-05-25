'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { coerceValue } from './validation/typeInference'
import type { FieldType, RecordType } from '@/types/database'
import type {
  AnalyzeResult, RowMatch, DedupeKey, ExecutionRow, ExecuteChunkResult, ImportSourceType,
} from './types'

const MAX_CHUNK = 200

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

function digits(v: string): string {
  return `${v ?? ''}`.replace(/\D/g, '')
}

// ── Board context (for the mapper) ────────────────────────────────────────────
export async function listImportBoards(organizationId: string): Promise<{ id: string; name: string; slug: string }[]> {
  const { supabase } = await requireUser()
  const { data } = await supabase
    .from('boards')
    .select('id, name, slug')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getBoardFieldsAndGroups(boardId: string): Promise<{
  fields: { id: string; name: string; slug: string; field_type: FieldType }[]
  groups: { id: string; name: string }[]
}> {
  const { supabase } = await requireUser()
  const [{ data: fields }, { data: groups }] = await Promise.all([
    supabase.from('fields').select('id, name, slug, field_type').eq('board_id', boardId).order('position', { ascending: true }),
    supabase.from('board_groups').select('id, name').eq('board_id', boardId).eq('is_archived', false).order('position', { ascending: true }),
  ])
  return { fields: fields ?? [], groups: groups ?? [] }
}

// ── Dedupe analysis ───────────────────────────────────────────────────────────
/**
 * Given candidate identity keys, return which incoming rows already match an
 * existing record on the target board (by email / phone / exact title).
 */
export async function analyzeDuplicates(
  boardId: string,
  dedupeKeys: DedupeKey[],
  candidates: { rowIndex: number; email?: string; phone?: string; name?: string }[],
): Promise<AnalyzeResult> {
  const { supabase } = await requireUser()

  // Resolve the email/phone field ids for this board (first of each type).
  const { data: fields } = await supabase
    .from('fields')
    .select('id, field_type')
    .eq('board_id', boardId)
  const emailFieldId = fields?.find((f) => f.field_type === 'email')?.id
  const phoneFieldId = fields?.find((f) => f.field_type === 'phone')?.id

  // Build lookup maps from existing data.
  const emailMap = new Map<string, string>()  // lower(email) → record_id
  const phoneMap = new Map<string, string>()  // digits(phone) → record_id
  const nameMap = new Map<string, string>()   // lower(title) → record_id

  if (dedupeKeys.includes('email') && emailFieldId) {
    const { data } = await supabase.from('field_values').select('record_id, value_text').eq('field_id', emailFieldId)
    for (const r of data ?? []) if (r.value_text) emailMap.set(r.value_text.toLowerCase().trim(), r.record_id)
  }
  if (dedupeKeys.includes('phone') && phoneFieldId) {
    const { data } = await supabase.from('field_values').select('record_id, value_text').eq('field_id', phoneFieldId)
    for (const r of data ?? []) if (r.value_text) { const d = digits(r.value_text); if (d.length >= 7) phoneMap.set(d, r.record_id) }
  }
  if (dedupeKeys.includes('name')) {
    const { data } = await supabase.from('records').select('id, title').eq('board_id', boardId).eq('is_archived', false)
    for (const r of data ?? []) if (r.title) nameMap.set(r.title.toLowerCase().trim(), r.id)
  }

  const matches: RowMatch[] = []
  let duplicates = 0
  for (const c of candidates) {
    let matchedRecordId: string | undefined
    let matchedOn: DedupeKey | undefined
    if (!matchedRecordId && c.email && emailMap.has(c.email.toLowerCase().trim())) { matchedRecordId = emailMap.get(c.email.toLowerCase().trim()); matchedOn = 'email' }
    if (!matchedRecordId && c.phone) { const d = digits(c.phone); if (d.length >= 7 && phoneMap.has(d)) { matchedRecordId = phoneMap.get(d); matchedOn = 'phone' } }
    if (!matchedRecordId && c.name && nameMap.has(c.name.toLowerCase().trim())) { matchedRecordId = nameMap.get(c.name.toLowerCase().trim()); matchedOn = 'name' }
    const isDuplicate = Boolean(matchedRecordId)
    if (isDuplicate) duplicates++
    matches.push({ rowIndex: c.rowIndex, isDuplicate, matchedRecordId, matchedOn })
  }

  return { total: candidates.length, duplicates, matches }
}

// ── Import run lifecycle ───────────────────────────────────────────────────────
export async function createImportRun(input: {
  organizationId: string
  boardId: string
  groupId: string | null
  sourceType: ImportSourceType
  templateKey?: string | null
  fileName: string
  rowCount: number
  mapping: Record<string, unknown>
}): Promise<string> {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase
    .from('imports')
    .insert({
      organization_id: input.organizationId,
      uploaded_by: user.id,
      board_id: input.boardId,
      group_id: input.groupId,
      source_type: input.sourceType,
      template_key: input.templateKey ?? null,
      file_name: input.fileName,
      status: 'running',
      row_count: input.rowCount,
      mapping: input.mapping,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create import')
  return data.id
}

/** Insert a chunk of records + their field values (batched, RLS-scoped). */
export async function executeImportChunk(input: {
  importId: string
  organizationId: string
  boardId: string
  groupId: string | null
  recordType: RecordType
  /** field_id → field_type, for value coercion */
  fieldTypes: Record<string, FieldType>
  rows: ExecutionRow[]
}): Promise<ExecuteChunkResult> {
  const { supabase, user } = await requireUser()
  const rows = input.rows.slice(0, MAX_CHUNK)
  if (rows.length === 0) return { imported: 0, failed: 0, errors: [] }

  // 1. Bulk insert the records.
  const recordInserts = rows.map((r) => ({
    organization_id: input.organizationId,
    board_id: input.boardId,
    group_id: input.groupId,
    title: r.title || 'Untitled',
    record_type: input.recordType,
    owner_user_id: user.id,
    created_by: user.id,
  }))

  const { data: created, error: recErr } = await supabase
    .from('records')
    .insert(recordInserts)
    .select('id')

  if (recErr || !created) {
    return { imported: 0, failed: rows.length, errors: rows.map((r) => ({ rowIndex: r.rowIndex, error: recErr?.message ?? 'insert failed' })) }
  }

  // 2. Build + bulk-upsert field values.
  const fvInserts: { field_id: string; record_id: string; value_text?: string | null; value_number?: number | null; value_boolean?: boolean | null; value_date?: string | null; value_json?: unknown }[] = []
  const importRowInserts: { import_id: string; organization_id: string; row_index: number; status: string; record_id: string; source_data: Record<string, string> }[] = []

  created.forEach((rec, i) => {
    const row = rows[i]
    for (const [fieldId, raw] of Object.entries(row.values)) {
      const ftype = input.fieldTypes[fieldId]
      if (!ftype) continue
      const patch = coerceValue(raw, ftype)
      if (patch) fvInserts.push({ field_id: fieldId, record_id: rec.id, ...patch })
    }
    importRowInserts.push({
      import_id: input.importId,
      organization_id: input.organizationId,
      row_index: row.rowIndex,
      status: 'imported',
      record_id: rec.id,
      source_data: row.source,
    })
  })

  if (fvInserts.length > 0) {
    // Upsert guards against the UNIQUE(field_id, record_id) constraint on retries.
    await supabase.from('field_values').upsert(fvInserts, { onConflict: 'field_id,record_id' })
  }
  if (importRowInserts.length > 0) {
    await supabase.from('import_rows').insert(importRowInserts)
  }

  return { imported: created.length, failed: 0, errors: [] }
}

/** Finalize the import: write counts/status + log one activity. Maps funnel stages. */
export async function finalizeImport(
  importId: string,
  organizationId: string,
  summary: { imported: number; skipped: number; failed: number; duplicates: number },
): Promise<void> {
  const { supabase, user } = await requireUser()

  const status = summary.failed > 0 && summary.imported === 0 ? 'failed'
    : summary.failed > 0 ? 'partial'
    : 'completed'

  await supabase
    .from('imports')
    .update({
      status,
      imported_count: summary.imported,
      skipped_count: summary.skipped,
      failed_count: summary.failed,
      duplicate_count: summary.duplicates,
      summary,
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId)

  // Single audit activity for the whole import (not one per row).
  if (summary.imported > 0) {
    await supabase.from('activities').insert({
      organization_id: organizationId,
      user_id: user.id,
      activity_type: 'integration_event',
      content: `Imported ${summary.imported} record${summary.imported === 1 ? '' : 's'}`,
      metadata: { source: 'import', import_id: importId, ...summary },
    })
  }

  // Make goal pacing reflect the freshly imported records.
  try {
    const { mapStarterFunnelStagesToGroups } = await import('@/features/onboarding/generators/funnelMapping')
    await mapStarterFunnelStagesToGroups(organizationId)
  } catch { /* best-effort */ }

  revalidatePath('/imports')
  revalidatePath('/today')
  revalidatePath('/boards')
}
