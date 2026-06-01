'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase 30B — drive the EXISTING import pipeline against the wizard-held
// File blobs after provisionWorkspace has created the boards.
//
// Reuses parseFile / autoMapColumns / getBoardFieldsAndGroups / analyzeDuplicates
// / createImportRun / executeImportChunk / finalizeImport — no new pipeline.
//
// Confidence gate: a file auto-imports only when autoMap finds a title column
// AND at least two columns map to existing fields with confidence ≥ 0.5.
// Otherwise the upload row is flipped to 'needs_review' and the LO is sent
// to /imports/new for that file — never silent bad data.
// ─────────────────────────────────────────────────────────────────────────

import { parseFile } from '@/features/imports/parsers'
import { autoMapColumns } from '@/features/imports/mapping/autoMap'
import {
  analyzeDuplicates,
  createImportRun,
  executeImportChunk,
  finalizeImport,
  getBoardFieldsAndGroups,
} from '@/features/imports/actions'
import { TITLE_TARGET, type ExecutionRow } from '@/features/imports/types'
import {
  completeChecklistItemByKey,
  updateOnboardingUploadStatus,
} from '@/features/onboarding/actions'
import type { FieldType, RecordType } from '@/types/database'
import type { OnboardingUploadKind } from '@/features/onboarding/types'
import type { PendingUpload } from '@/features/onboarding/state/OnboardingWizardProvider'

const CHUNK_SIZE = 100
const MIN_HIGH_CONF_MAPPINGS = 2 // need title + ≥2 named-field matches
const CONF_THRESHOLD = 0.5

// kind → board template key + record type used by executeImportChunk.
const KIND_MAP: Record<OnboardingUploadKind, { boardKey: string; recordType: RecordType; checklistKey?: string }> = {
  past_clients: { boardKey: 'past_clients',   recordType: 'contact',  checklistKey: 'import-past-clients' },
  active_leads: { boardKey: 'active_leads',   recordType: 'lead' },
  call_list:    { boardKey: 'prospecting',    recordType: 'lead' },
  realtors:     { boardKey: 'partners',       recordType: 'referral' },
  loans:        { boardKey: 'pipeline',       recordType: 'loan' },
}

export type ImportResultStatus = 'completed' | 'needs_review' | 'failed' | 'skipped'

export type OnboardingImportResult = {
  kind: OnboardingUploadKind
  fileName: string
  boardKey: string
  boardId: string | null
  status: ImportResultStatus
  imported: number
  failed: number
  totalRows: number
  error?: string
}

export type ProgressEvent = {
  kind: OnboardingUploadKind
  fileName: string
  phase: 'parsing' | 'mapping' | 'analyzing' | 'importing' | 'done' | 'needs_review' | 'failed'
  done?: number
  total?: number
}

export type RunInput = {
  organizationId: string
  createdBoards: { key: string; id: string; slug: string; name: string }[]
  pendingUploads: Partial<Record<OnboardingUploadKind, PendingUpload>>
  onProgress?: (e: ProgressEvent) => void
}

export async function runOnboardingImports(input: RunInput): Promise<OnboardingImportResult[]> {
  const boardByKey = new Map(input.createdBoards.map((b) => [b.key, b]))
  const out: OnboardingImportResult[] = []
  const checklistKeysCompleted = new Set<string>()

  for (const [k, payload] of Object.entries(input.pendingUploads)) {
    const kind = k as OnboardingUploadKind
    if (!payload) continue
    const mapEntry = KIND_MAP[kind]
    const board = boardByKey.get(mapEntry.boardKey) ?? null
    const fileName = payload.file.name

    // One bad file must not block the rest — wrap each in its own try.
    try {
      if (!board) {
        await updateOnboardingUploadStatus(payload.uploadId, 'failed')
        out.push({ kind, fileName, boardKey: mapEntry.boardKey, boardId: null, status: 'failed', imported: 0, failed: 0, totalRows: 0, error: 'board not provisioned' })
        input.onProgress?.({ kind, fileName, phase: 'failed' })
        continue
      }

      // ── Parse ────────────────────────────────────────────────────────────
      input.onProgress?.({ kind, fileName, phase: 'parsing' })
      const parsed = await parseFile(payload.file)
      const sheet = parsed.sheets[0]
      if (!sheet || sheet.rows.length === 0) {
        await updateOnboardingUploadStatus(payload.uploadId, 'needs_review', { row_count: 0 })
        out.push({ kind, fileName, boardKey: mapEntry.boardKey, boardId: board.id, status: 'needs_review', imported: 0, failed: 0, totalRows: 0, error: 'empty file' })
        input.onProgress?.({ kind, fileName, phase: 'needs_review' })
        continue
      }
      const headers = sheet.headers
      const rows = sheet.rows

      // ── Map ──────────────────────────────────────────────────────────────
      input.onProgress?.({ kind, fileName, phase: 'mapping' })
      const { fields } = await getBoardFieldsAndGroups(board.id)
      let mappings = autoMapColumns(headers, rows, fields)
      // Guarantee a title column — fall back to col 0 (mirrors ImportWizard).
      if (!mappings.some((m) => m.target === TITLE_TARGET) && mappings.length > 0) {
        mappings = mappings.map((m, i) => (i === 0 ? { ...m, target: TITLE_TARGET } : m))
      }
      const highConfMapped = mappings.filter(
        (m) => m.target && m.target !== TITLE_TARGET && (m.meta?.confidence ?? 0) >= CONF_THRESHOLD,
      ).length
      const hasTitle = mappings.some((m) => m.target === TITLE_TARGET)
      if (!hasTitle || highConfMapped < MIN_HIGH_CONF_MAPPINGS) {
        await updateOnboardingUploadStatus(payload.uploadId, 'needs_review', { row_count: rows.length })
        out.push({ kind, fileName, boardKey: mapEntry.boardKey, boardId: board.id, status: 'needs_review', imported: 0, failed: 0, totalRows: rows.length })
        input.onProgress?.({ kind, fileName, phase: 'needs_review', total: rows.length })
        continue
      }

      const titleColIdx = mappings.find((m) => m.target === TITLE_TARGET)!.columnIndex
      const fieldTypeByTarget = new Map(fields.map((f) => [f.id, f.field_type]))
      const fieldTypes: Record<string, FieldType> = {}
      for (const m of mappings) {
        if (m.target && m.target !== TITLE_TARGET) {
          const ft = fieldTypeByTarget.get(m.target)
          if (ft) fieldTypes[m.target] = ft
        }
      }

      // ── Dedupe (skip default — empty board, mostly 0 hits) ──────────────
      input.onProgress?.({ kind, fileName, phase: 'analyzing' })
      const emailCol = mappings.find((m) => fieldTypes[m.target] === 'email')?.columnIndex
      const phoneCol = mappings.find((m) => fieldTypes[m.target] === 'phone')?.columnIndex
      const candidates = rows.map((r, i) => ({
        rowIndex: i,
        name: r[titleColIdx],
        email: emailCol != null ? r[emailCol] : undefined,
        phone: phoneCol != null ? r[phoneCol] : undefined,
      }))
      const analysis = await analyzeDuplicates(board.id, ['email', 'phone', 'name'], candidates)
      const dupeRowIdx = new Set(analysis.matches.filter((m) => m.isDuplicate).map((m) => m.rowIndex))
      const processIdx = rows.map((_, i) => i).filter((i) => !dupeRowIdx.has(i))

      // ── Execute ─────────────────────────────────────────────────────────
      const importId = await createImportRun({
        organizationId: input.organizationId,
        boardId: board.id,
        groupId: null,
        sourceType: parsed.sourceType,
        templateKey: null,
        fileName,
        rowCount: rows.length,
        mapping: { mode: 'onboarding', columns: mappings.map((m) => ({ header: m.header, target: m.target })), dedupeBehavior: 'skip' },
      })

      const execRows: ExecutionRow[] = processIdx.map((i) => {
        const r = rows[i]
        const values: Record<string, string> = {}
        const source: Record<string, string> = {}
        for (const m of mappings) {
          const cell = r[m.columnIndex] ?? ''
          source[m.header] = cell
          if (m.target && m.target !== TITLE_TARGET) values[m.target] = cell
        }
        return { rowIndex: i, title: (r[titleColIdx] ?? '').trim() || 'Untitled', values, source }
      })

      let imported = 0
      let failed = 0
      input.onProgress?.({ kind, fileName, phase: 'importing', done: 0, total: execRows.length })
      for (let i = 0; i < execRows.length; i += CHUNK_SIZE) {
        const chunk = execRows.slice(i, i + CHUNK_SIZE)
        const res = await executeImportChunk({
          importId,
          organizationId: input.organizationId,
          boardId: board.id,
          groupId: null,
          recordType: mapEntry.recordType,
          fieldTypes,
          rows: chunk,
        })
        imported += res.imported
        failed += res.failed
        input.onProgress?.({ kind, fileName, phase: 'importing', done: Math.min(i + chunk.length, execRows.length), total: execRows.length })
      }
      await finalizeImport(importId, input.organizationId, {
        imported, updated: 0, skipped: dupeRowIdx.size, failed, duplicates: dupeRowIdx.size,
      })

      // ── Audit + checklist ───────────────────────────────────────────────
      await updateOnboardingUploadStatus(payload.uploadId, 'completed', { row_count: imported })
      if (imported > 0 && mapEntry.checklistKey) checklistKeysCompleted.add(mapEntry.checklistKey)

      out.push({ kind, fileName, boardKey: mapEntry.boardKey, boardId: board.id, status: 'completed', imported, failed, totalRows: rows.length })
      input.onProgress?.({ kind, fileName, phase: 'done', done: imported, total: rows.length })
    } catch (err) {
      try { await updateOnboardingUploadStatus(payload.uploadId, 'failed') } catch { /* ignore */ }
      out.push({
        kind, fileName,
        boardKey: mapEntry.boardKey,
        boardId: board?.id ?? null,
        status: 'failed', imported: 0, failed: 0, totalRows: 0,
        error: err instanceof Error ? err.message : 'unknown error',
      })
      input.onProgress?.({ kind, fileName, phase: 'failed' })
    }
  }

  for (const key of checklistKeysCompleted) {
    try { await completeChecklistItemByKey(input.organizationId, key) } catch { /* best-effort */ }
  }

  return out
}
