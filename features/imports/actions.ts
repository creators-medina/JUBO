'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { coerceValue } from './validation/typeInference'
import { statusOptionsFromValues } from '@/features/fields/status'
import type { MondayParseResult } from './parsers/mondayXlsx'
import type { BoardType, FieldType, RecordType } from '@/types/database'
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
  if (rows.length === 0) return { imported: 0, updated: 0, failed: 0, errors: [] }

  // Rows matched to an existing record (dedupe 'update') update in place; the rest create.
  const createRows = rows.filter((r) => !r.matchedRecordId)
  const updateRows = rows.filter((r) => r.matchedRecordId)

  let imported = 0
  let updated = 0
  let failed = 0
  const errors: { rowIndex: number; error: string }[] = []
  const fvInserts: { field_id: string; record_id: string; value_text?: string | null; value_number?: number | null; value_boolean?: boolean | null; value_date?: string | null; value_json?: unknown }[] = []
  const importRowInserts: { import_id: string; organization_id: string; row_index: number; status: string; record_id: string; matched_record_id?: string; source_data: Record<string, string> }[] = []

  // coerceValue returns null for empty cells → blanks never overwrite existing data.
  const coerceInto = (recordId: string, values: Record<string, string>) => {
    for (const [fieldId, raw] of Object.entries(values)) {
      const ftype = input.fieldTypes[fieldId]
      if (!ftype) continue
      const patch = coerceValue(raw, ftype)
      if (patch) fvInserts.push({ field_id: fieldId, record_id: recordId, ...patch })
    }
  }

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (createRows.length > 0) {
    // Per-row groupId wins when present (Create-Board-From-File routes by status);
    // existing flows leave it unset so we fall back to the import-wide groupId.
    const recordInserts = createRows.map((r) => ({
      organization_id: input.organizationId,
      board_id: input.boardId,
      group_id: r.groupId ?? input.groupId,
      title: r.title || 'Untitled',
      record_type: input.recordType,
      owner_user_id: user.id,
      created_by: user.id,
    }))
    const { data: created, error: recErr } = await supabase.from('records').insert(recordInserts).select('id')
    if (recErr || !created) {
      failed += createRows.length
      for (const r of createRows) errors.push({ rowIndex: r.rowIndex, error: recErr?.message ?? 'insert failed' })
    } else {
      imported = created.length
      created.forEach((rec, i) => {
        const row = createRows[i]
        coerceInto(rec.id, row.values)
        importRowInserts.push({ import_id: input.importId, organization_id: input.organizationId, row_index: row.rowIndex, status: 'imported', record_id: rec.id, source_data: row.source })
      })
    }
  }

  // ── UPDATE EXISTING (never wipes — empty incoming cells are skipped) ─────────
  for (const row of updateRows) {
    const rid = row.matchedRecordId as string
    coerceInto(rid, row.values)
    importRowInserts.push({ import_id: input.importId, organization_id: input.organizationId, row_index: row.rowIndex, status: 'updated', record_id: rid, matched_record_id: rid, source_data: row.source })
    updated++
  }

  if (fvInserts.length > 0) {
    // Upsert guards the UNIQUE(field_id, record_id) constraint (retry- + update-safe).
    await supabase.from('field_values').upsert(fvInserts, { onConflict: 'field_id,record_id' })
  }
  if (importRowInserts.length > 0) {
    await supabase.from('import_rows').insert(importRowInserts)
  }

  return { imported, updated, failed, errors }
}

/** Finalize the import: write counts/status + log one activity. Maps funnel stages. */
export async function finalizeImport(
  importId: string,
  organizationId: string,
  summary: { imported: number; updated: number; skipped: number; failed: number; duplicates: number },
): Promise<void> {
  const { supabase, user } = await requireUser()

  const touched = summary.imported + summary.updated
  const status = summary.failed > 0 && touched === 0 ? 'failed'
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
      summary,                       // `updated` count persists here (no column needed)
      completed_at: new Date().toISOString(),
    })
    .eq('id', importId)

  // Single audit activity for the whole import (not one per row).
  if (touched > 0) {
    const parts = [
      summary.imported > 0 ? `imported ${summary.imported}` : null,
      summary.updated > 0 ? `updated ${summary.updated}` : null,
    ].filter(Boolean).join(' · ')
    await supabase.from('activities').insert({
      organization_id: organizationId,
      user_id: user.id,
      activity_type: 'integration_event',
      content: `Import complete — ${parts} record${touched === 1 ? '' : 's'}`,
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

// ── Create Board From File (Phase 27B) ────────────────────────────────────────
/**
 * Provision a new board + groups + fields atomically (from the caller's session)
 * so the existing import pipeline can write into it. Slug-dedupes the board
 * against the org's existing boards, in-memory-dedupes field slugs (fresh board
 * has none), preserves the caller's group order. Reusable for Create-Board UIs.
 */
export async function provisionBoardFromImport(input: {
  organizationId: string
  name: string
  boardType: BoardType
  fields: { columnIndex: number; name: string; fieldType: FieldType; config?: Record<string, unknown> }[]
  /** Group names in order. Empty → a single default group named "New". */
  groups: string[]
}): Promise<{
  boardId: string
  fields: { columnIndex: number; id: string; field_type: FieldType }[]
  groups: { name: string; id: string }[]
  defaultGroupId: string
}> {
  const { supabase, user } = await requireUser()

  const name = input.name.trim()
  if (!name) throw new Error('Board name is required')

  // boards has UNIQUE(organization_id, slug) — dedupe within the org.
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'board'
  const { data: existingBoards } = await supabase
    .from('boards').select('slug').eq('organization_id', input.organizationId)
  const usedBoardSlugs = new Set((existingBoards ?? []).map((b) => b.slug))
  let slug = base
  let n = 1
  while (usedBoardSlugs.has(slug)) slug = `${base}_${n++}`

  const { data: board, error: boardErr } = await supabase
    .from('boards')
    .insert({
      organization_id: input.organizationId,
      name,
      slug,
      board_type: input.boardType,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (boardErr || !board) throw new Error(boardErr?.message ?? 'Could not create board')
  const boardId = board.id

  // Groups — at least one; default to "New" so records always have a home.
  const groupNames = input.groups.length > 0 ? input.groups : ['New']
  const groupRows = groupNames.map((gname, i) => ({ board_id: boardId, name: gname, position: i }))
  const { data: createdGroups, error: groupErr } = await supabase
    .from('board_groups').insert(groupRows).select('id, name, position').order('position', { ascending: true })
  if (groupErr || !createdGroups) throw new Error(groupErr?.message ?? 'Could not create groups')

  // Preserve user-supplied order.
  const groups = groupNames.map((gname, i) => {
    const match = createdGroups.find((g) => g.position === i)
    if (!match) throw new Error(`Group ${gname} could not be created`)
    return { name: gname, id: match.id }
  })
  const defaultGroupId = groups[0].id

  // Fields — fresh board so dedupe slugs in-memory.
  let createdFieldsByIndex: { columnIndex: number; id: string; field_type: FieldType }[] = []
  if (input.fields.length > 0) {
    const usedFieldSlugs = new Set<string>()
    const fieldRows = input.fields.map((f, i) => {
      const fname = (f.name || '').trim() || `field_${i + 1}`
      const fbase = fname.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `field_${i + 1}`
      let fslug = fbase
      let k = 1
      while (usedFieldSlugs.has(fslug)) fslug = `${fbase}_${k++}`
      usedFieldSlugs.add(fslug)
      return {
        organization_id: input.organizationId,
        board_id: boardId,
        name: fname,
        slug: fslug,
        field_type: f.fieldType,
        config: f.config ?? {},
        position: i + 1,
      }
    })
    const { data: createdFields, error: fieldErr } = await supabase
      .from('fields').insert(fieldRows).select('id, slug, field_type')
    if (fieldErr || !createdFields) throw new Error(fieldErr?.message ?? 'Could not create fields')

    createdFieldsByIndex = input.fields.map((f, i) => {
      const row = fieldRows[i]
      const created = createdFields.find((c) => c.slug === row.slug)
      if (!created) throw new Error(`Field ${f.name} could not be created`)
      return { columnIndex: f.columnIndex, id: created.id, field_type: created.field_type as FieldType }
    })
  }

  revalidatePath('/boards')
  return { boardId, fields: createdFieldsByIndex, groups, defaultGroupId }
}

// ── Monday.com export import (parents + subitems) ─────────────────────────────

function mondayFieldType(header: string): FieldType {
  const h = header.toLowerCase()
  if (/email/.test(h)) return 'email'
  if (/phone|mobile|cell/.test(h)) return 'phone'
  if (/date|birthday|closed|dob|anniversary/.test(h)) return 'date'
  if (/\b(rate|amount|price|volume|score|count|number|qty|balance|fico)\b/.test(h)) return 'number'
  if (/notes|description|comment/.test(h)) return 'textarea'
  return 'text'
}

/**
 * Import a parsed Monday.com export: provisions a board from the parent headers
 * (+ subitem fields), creates one record per parent, and attaches each subitem
 * as a child record (records.parent_record_id). Never creates a "Subitems"
 * record. Reuses provisionBoardFromImport + coerceValue.
 */
export async function executeMondayImport(input: {
  organizationId: string
  parsed: MondayParseResult
}): Promise<{ boardId: string; parentsImported: number; subitemsImported: number; failed: number }> {
  const { supabase, user } = await requireUser()
  const { organizationId, parsed } = input
  const hasSubitems = parsed.subitemCount > 0

  // 1. Field plan: parent fields (by header) + subitem fields (Owner/Status/Date).
  const parentSpecs = parsed.parentHeaders.map((h, i) => ({
    columnIndex: i, name: h, fieldType: mondayFieldType(h),
  }))
  const base = parsed.parentHeaders.length
  const subitemStatuses = parsed.parents.flatMap((p) => p.subitems.map((s) => s.status)).filter(Boolean)
  const subitemSpecs = hasSubitems ? [
    { columnIndex: base, name: 'Owner', fieldType: 'text' as FieldType },
    { columnIndex: base + 1, name: 'Status', fieldType: 'select' as FieldType, config: { options: statusOptionsFromValues(subitemStatuses) } },
    { columnIndex: base + 2, name: 'Subitem Date', fieldType: 'date' as FieldType },
  ] : []

  // 2. Provision the board (slug-deduped) + fields + Monday groups (in order).
  const provision = await provisionBoardFromImport({
    organizationId,
    name: parsed.boardName || 'Imported board',
    boardType: 'crm',
    fields: [...parentSpecs, ...subitemSpecs],
    groups: parsed.groups,
  })
  const boardId = provision.boardId
  const defaultGroupId = provision.defaultGroupId
  const groupByName = new Map(provision.groups.map((g) => [g.name, g.id]))
  const groupIdFor = (name: string | null) => (name ? groupByName.get(name) : undefined) ?? defaultGroupId
  const byCol = new Map(provision.fields.map((f) => [f.columnIndex, f]))
  const parentFieldByHeader = new Map(parentSpecs.map((s) => [s.name, byCol.get(s.columnIndex)!]))
  const ownerField = hasSubitems ? byCol.get(base) : undefined
  const statusField = hasSubitems ? byCol.get(base + 1) : undefined
  const dateField = hasSubitems ? byCol.get(base + 2) : undefined

  let importId = ''
  try {
    importId = await createImportRun({
      organizationId, boardId, groupId: defaultGroupId,
      sourceType: 'monday', templateKey: null,
      fileName: `${parsed.boardName} (Monday export)`,
      rowCount: parsed.parentCount + parsed.subitemCount,
      mapping: {
        mode: 'monday', boardName: parsed.boardName,
        groups: parsed.groups,
        parentHeaders: parsed.parentHeaders, subitemHeaders: parsed.subitemHeaders,
        parentCount: parsed.parentCount, subitemCount: parsed.subitemCount,
        warnings: parsed.warnings,
      },
    })
  } catch { /* audit run is best-effort */ }

  let failed = 0

  // 3. Parent records (bulk insert preserves order — same pattern as executeImportChunk).
  //    Each parent lands in its Monday group (fallback: default group).
  const parentInserts = parsed.parents.map((p) => ({
    organization_id: organizationId, board_id: boardId, group_id: groupIdFor(p.group),
    title: p.title.trim() || 'Untitled', record_type: 'contact' as RecordType,
    owner_user_id: user.id, created_by: user.id,
  }))
  const { data: createdParents, error: parentErr } = await supabase
    .from('records').insert(parentInserts).select('id')
  if (parentErr || !createdParents) throw new Error(parentErr?.message ?? 'Could not create parent records')

  // 4. Parent field values.
  const parentFv: Record<string, unknown>[] = []
  parsed.parents.forEach((p, i) => {
    const rid = (createdParents[i] as { id: string }).id
    for (const [header, raw] of Object.entries(p.values)) {
      const f = parentFieldByHeader.get(header)
      if (!f || !raw) continue
      const patch = coerceValue(raw, f.field_type)
      if (patch) parentFv.push({ field_id: f.id, record_id: rid, ...patch })
    }
  })
  if (parentFv.length > 0) {
    const { error } = await supabase.from('field_values').insert(parentFv)
    if (error) failed += 1
  }

  // 5. Subitems → child records (parent_record_id) + their field values.
  let subitemsImported = 0
  if (hasSubitems) {
    const flat: { parentId: string; groupId: string; s: typeof parsed.parents[number]['subitems'][number] }[] = []
    parsed.parents.forEach((p, i) => {
      const parentId = (createdParents[i] as { id: string }).id
      for (const s of p.subitems) flat.push({ parentId, groupId: groupIdFor(p.group), s })
    })
    if (flat.length > 0) {
      const subInserts = flat.map(({ parentId, groupId: gid, s }) => ({
        organization_id: organizationId, board_id: boardId, group_id: gid,
        parent_record_id: parentId, title: s.name.trim() || 'Subitem',
        record_type: 'contact' as RecordType, owner_user_id: user.id, created_by: user.id,
      }))
      const { data: createdSubs, error: subErr } = await supabase
        .from('records').insert(subInserts).select('id')
      if (subErr || !createdSubs) throw new Error(subErr?.message ?? 'Could not create subitems')
      subitemsImported = createdSubs.length

      const subFv: Record<string, unknown>[] = []
      createdSubs.forEach((row, i) => {
        const rid = (row as { id: string }).id
        const s = flat[i].s
        const push = (f: { id: string; field_type: FieldType } | undefined, raw: string) => {
          if (!f || !raw) return
          const patch = coerceValue(raw, f.field_type)
          if (patch) subFv.push({ field_id: f.id, record_id: rid, ...patch })
        }
        push(ownerField, s.owner)
        push(statusField, s.status)
        push(dateField, s.date)
      })
      if (subFv.length > 0) {
        const { error } = await supabase.from('field_values').insert(subFv)
        if (error) failed += 1
      }
    }
  }

  if (importId) {
    try {
      await finalizeImport(importId, organizationId, {
        imported: createdParents.length + subitemsImported, updated: 0, skipped: 0, failed, duplicates: 0,
      })
    } catch { /* best-effort */ }
  }

  revalidatePath('/boards')
  return { boardId, parentsImported: createdParents.length, subitemsImported, failed }
}
