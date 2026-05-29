// ─────────────────────────────────────────────────────────────────────────
// Phase 16 — Import engine types.
//
// Generic ingestion layer. Nothing here is mortgage-specific; the flavor lives
// in templates/. The pipeline is: parse → infer types → map columns → dedupe →
// preview → execute (chunked) → summary.
// ─────────────────────────────────────────────────────────────────────────

import type { FieldType } from '@/types/database'

export type ImportSourceType = 'csv' | 'xlsx' | 'monday'

/** A parsed sheet/file: header row + data rows (arrays of cell strings). */
export type ParsedSheet = {
  name: string
  headers: string[]
  rows: string[][]
}

export type ParsedFile = {
  sourceType: ImportSourceType
  fileName: string
  sheets: ParsedSheet[]
  /** true if the file looks like a Monday.com export */
  isMonday: boolean
}

/** Inferred column type from sample values, with a 0..1 confidence. */
export type InferredType = {
  type: FieldType
  confidence: number
}

// ── Mapping ─────────────────────────────────────────────────────────────────

/** Special target for the record's title column (records.title is required). */
export const TITLE_TARGET = '__title__' as const

/** Why a column was mapped — surfaced as a confidence badge to build trust. */
export type MappingReason = 'matched-by-header' | 'synonym' | 'type-detected' | 'fuzzy-match' | 'manual' | 'created' | 'skipped'

export type MappingMetadata = {
  confidence: number        // 0..1
  reason: MappingReason
}

/** One column → target mapping. target is a field id, TITLE_TARGET, or '' (skip). */
export type ColumnMapping = {
  columnIndex: number
  header: string
  target: string            // field id | TITLE_TARGET | '' (ignore)
  inferred: InferredType
  /** for newly-created fields not yet persisted (later-ready); unused in v1 */
  createFieldType?: FieldType
  /** confidence/reason for the auto-mapping (trust signal) */
  meta?: MappingMetadata
}

/** A board's field, as the mapper sees it. */
export type TargetField = {
  id: string
  name: string
  slug: string
  field_type: FieldType
}

// ── Dedupe ────────────────────────────────────────────────────────────────

export type DedupeKey = 'email' | 'phone' | 'name'

export type DedupeBehavior = 'skip' | 'create' | 'update'

/** Per-row dedupe outcome computed by the server analyze step. */
export type RowMatch = {
  rowIndex: number
  isDuplicate: boolean
  matchedRecordId?: string
  matchedOn?: DedupeKey
}

export type AnalyzeResult = {
  total: number
  duplicates: number
  matches: RowMatch[]
}

// ── Execution ───────────────────────────────────────────────────────────────

/** A single row reduced to what the executor needs: title + field values. */
export type ExecutionRow = {
  rowIndex: number
  title: string
  /** field_id → raw string cell value (coerced server-side by field_type) */
  values: Record<string, string>
  /** raw source row (header → cell) for audit */
  source: Record<string, string>
  /** existing record to update instead of creating (dedupe behavior 'update') */
  matchedRecordId?: string
}

export type ExecuteChunkResult = {
  imported: number
  updated: number
  failed: number
  errors: { rowIndex: number; error: string }[]
}

export type ImportSummary = {
  imported: number
  updated: number
  skipped: number
  failed: number
  duplicates: number
}

// ── Row types (DB) ───────────────────────────────────────────────────────────

export type ImportRow = {
  id: string
  organization_id: string
  uploaded_by: string | null
  board_id: string | null
  group_id: string | null
  source_type: ImportSourceType
  template_key: string | null
  file_name: string
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed'
  row_count: number
  imported_count: number
  skipped_count: number
  failed_count: number
  duplicate_count: number
  mapping: Record<string, unknown>
  summary: Record<string, unknown>
  created_at: string
  completed_at: string | null
}
