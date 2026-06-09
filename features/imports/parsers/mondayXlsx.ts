'use client'

// ─────────────────────────────────────────────────────────────────────────
// Monday.com XLSX export adapter.
//
// Monday exports are NOT flat spreadsheets. They look like:
//   row 0..k : board-title metadata ("Past Clients" in col 0, rest blank)
//   row k    : parent header  → [Name, Subitems, Phone, EMAIL, Address, ...]
//   parent rows (col0 = name)
//   ...interleaved subitem blocks:
//     [Subitems, Name, Owner, Status, Date]   ← block header (col0 = "Subitems")
//     ["", <subitem name>, <owner>, <status>, <date>]  ← subitem rows (col0 blank)
//   Subitem rows belong to the most recent parent above them.
//
// This adapter detects that shape and returns a normalized parent/subitem tree
// the importer can execute. It never flattens subitems into parents and never
// creates a record named "Subitems".
// ─────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx'

export type MondaySubitem = { name: string; owner: string; status: string; date: string }
export type MondayParent = { title: string; group: string | null; values: Record<string, string>; subitems: MondaySubitem[] }
export type MondayParseResult = {
  boardName: string
  groups: string[]          // Monday groups in file order (e.g. [Past Clients, New Past Clients])
  parentHeaders: string[]   // cleaned, excludes Name (title) + Subitems column
  subitemHeaders: string[]  // e.g. [Name, Owner, Status, Date]
  parents: MondayParent[]
  parentCount: number
  subitemCount: number
  warnings: string[]
}

const norm = (v: unknown) => `${v ?? ''}`.trim().toLowerCase()
const isBlankRow = (r: unknown[]) => !r || r.every((c) => c == null || `${c}`.trim() === '')
const DATE_HEADER_RE = /date|birthday|closed|dob|anniversary/i

const isHeaderRow = (r: unknown[]) => norm(r?.[0]) === 'name' && norm(r?.[1]) === 'subitems'
const isSubitemHeaderRow = (r: unknown[]) => norm(r?.[0]) === 'subitems' && norm(r?.[1]) === 'name'
/** A row with only the first column filled — a board-title or group marker. */
const isOnlyCol0 = (r: unknown[]) => {
  const f = (r ?? []).map((c) => `${c ?? ''}`.trim())
  return f[0] !== '' && f.slice(1).every((x) => x === '')
}
const nextNonBlankIdx = (aoa: unknown[][], from: number) => {
  for (let j = from; j < aoa.length; j++) if (!isBlankRow(aoa[j] ?? [])) return j
  return -1
}

/** Clean a Monday header into a friendly field name (EMAIL → Email). */
function cleanHeader(h: unknown): string {
  const t = `${h ?? ''}`.trim()
  if (/^email$/i.test(t)) return 'Email'
  return t
}

/** Excel serial (1899-12-30 epoch) → YYYY-MM-DD, or null if not a valid serial. */
export function excelSerialToISO(n: number): string | null {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return null
  const ms = Math.round((n - 25569) * 86400 * 1000) // 25569 days between 1899-12-30 and 1970-01-01
  const d = new Date(ms)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

/** True if the array-of-arrays looks like a Monday export (parent header or subitem block present). */
export function detectMondayAoa(aoa: unknown[][]): boolean {
  // Parent header: a row with col0 = "Name" and col1 = "Subitems" in the first few rows.
  for (let i = 0; i < Math.min(aoa.length, 8); i++) {
    if (norm(aoa[i]?.[0]) === 'name' && norm(aoa[i]?.[1]) === 'subitems') return true
  }
  // Or an inline subitem block header anywhere.
  for (const row of aoa) {
    if (norm(row?.[0]) === 'subitems' && norm(row?.[1]) === 'name') return true
  }
  return false
}

/**
 * Pure parse of a Monday array-of-arrays → normalized parent/subitem tree.
 * Returns null if the sheet is not a Monday export.
 */
export function parseMondayAoa(aoa: unknown[][], sheetName: string): MondayParseResult | null {
  const warnings: string[] = []

  // Locate every column-header row. Monday repeats the header once per group.
  const headerIdxs: number[] = []
  for (let i = 0; i < aoa.length; i++) if (isHeaderRow(aoa[i] ?? [])) headerIdxs.push(i)
  if (headerIdxs.length === 0) return null
  const firstHeaderIdx = headerIdxs[0]

  // Parent data columns come from the header (refreshed if a repeated header
  // ever differs). col0 = Name/title, col1 = Subitems/ignored, col2+ = fields.
  let parentCols: { index: number; header: string }[] = []
  const setParentCols = (row: unknown[]) => {
    parentCols = []
    for (let c = 2; c < row.length; c++) {
      const h = `${row[c] ?? ''}`.trim()
      if (h) parentCols.push({ index: c, header: cleanHeader(h) })
    }
  }
  setParentCols(aoa[firstHeaderIdx] ?? [])
  const parentHeaders = parentCols.map((c) => c.header)
  let subitemHeaders = ['Name', 'Owner', 'Status', 'Date']

  const parents: MondayParent[] = []
  let current: MondayParent | null = null
  let currentGroup: string | null = null
  const groups: string[] = []
  const seenGroups = new Set<string>()
  const ensureGroup = (name: string) => { if (!seenGroups.has(name)) { seenGroups.add(name); groups.push(name) } }
  let boardName = sheetName
  let orphanSubitems = 0

  for (let i = 0; i < aoa.length; i++) {
    const row = aoa[i] ?? []
    if (isBlankRow(row)) continue

    // Column-header row (first or a repeated per-group one) — never a record.
    if (isHeaderRow(row)) { setParentCols(row); continue }
    // Subitem block header — capture layout, never a record.
    if (isSubitemHeaderRow(row)) {
      subitemHeaders = [cleanHeader(row[1]) || 'Name', cleanHeader(row[2]) || 'Owner', cleanHeader(row[3]) || 'Status', cleanHeader(row[4]) || 'Date']
      continue
    }

    // A row with only col0 filled is a board-title or a GROUP marker. It's a
    // group iff the next non-blank row is a column header (Monday repeats the
    // header under each group); otherwise it's board-title metadata, or — below
    // the headers — a lone-name parent record.
    if (isOnlyCol0(row)) {
      const label = `${row[0] ?? ''}`.trim()
      const nb = nextNonBlankIdx(aoa, i + 1)
      if (nb >= 0 && isHeaderRow(aoa[nb] ?? [])) {
        currentGroup = label
        ensureGroup(label)
        continue
      }
      if (i < firstHeaderIdx) {
        if (boardName === sheetName) boardName = label // topmost metadata = board title
        continue
      }
      // lone-name parent (rare): a record with only a name.
      current = { title: label, group: currentGroup, values: {}, subitems: [] }
      parents.push(current)
      continue
    }

    const col0 = `${row[0] ?? ''}`.trim()
    if (col0 === '') {
      // col0 blank → subitem data row (name in col1) or a group summary row (col1 also blank → skip).
      const name = `${row[1] ?? ''}`.trim()
      if (!name) continue
      if (!current) { orphanSubitems++; continue }
      const dateCell = row[4]
      current.subitems.push({
        name,
        owner: `${row[2] ?? ''}`.trim(),
        status: `${row[3] ?? ''}`.trim(),
        date: typeof dateCell === 'number' ? (excelSerialToISO(dateCell) ?? '') : `${dateCell ?? ''}`.trim(),
      })
      continue
    }

    // Parent row.
    const values: Record<string, string> = {}
    for (const pc of parentCols) {
      const cell = row[pc.index]
      if (DATE_HEADER_RE.test(pc.header) && typeof cell === 'number') {
        values[pc.header] = excelSerialToISO(cell) ?? `${cell}`
      } else {
        values[pc.header] = cell == null ? '' : `${cell}`.trim()
      }
    }
    current = { title: col0, group: currentGroup, values, subitems: [] }
    parents.push(current)
  }

  if (orphanSubitems > 0) {
    warnings.push(`${orphanSubitems} subitem row(s) appeared before any parent and were skipped.`)
  }

  const subitemCount = parents.reduce((sum, p) => sum + p.subitems.length, 0)
  return { boardName, groups, parentHeaders, subitemHeaders, parents, parentCount: parents.length, subitemCount, warnings }
}

/**
 * Read a File and parse it as a Monday export. Returns null if it isn't one
 * (so the caller can fall back to the generic CSV/XLSX pipeline). Uses the first
 * worksheet.
 */
export async function tryParseMondayFile(file: File): Promise<MondayParseResult | null> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (!(ext === 'xlsx' || ext === 'xls' || file.type.includes('spreadsheetml'))) return null
  let aoa: unknown[][]
  let sheetName = 'Sheet1'
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    if (wb.SheetNames.length === 0) return null
    sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    if (!ws) return null
    // raw:true keeps Excel date serials as numbers so we can convert them.
    aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true })
  } catch {
    return null
  }
  if (!detectMondayAoa(aoa)) return null
  return parseMondayAoa(aoa, sheetName)
}
