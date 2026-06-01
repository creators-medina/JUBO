'use client'

import Papa from 'papaparse'
import type { ParsedSheet } from '../types'

const MAX_ROWS = 5000
const MAX_HEADER_SCAN = 5      // never look past row 5 for the header
const MAX_HEADER_LEN = 60      // a real header cell rarely exceeds this

/** Parse a CSV file into a single sheet of raw string rows. */
export function parseCsv(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (res) => {
        const all = (res.data as unknown as string[][]).filter((r) => Array.isArray(r) && r.some((c) => `${c ?? ''}`.trim() !== ''))
        if (all.length === 0) {
          reject(new Error('The file appears to be empty.'))
          return
        }
        const { headers, rows } = splitHeaderRows(all)
        resolve({ name: file.name.replace(/\.[^.]+$/, ''), headers, rows: rows.slice(0, MAX_ROWS) })
      },
      error: (err) => reject(new Error(err.message || 'Failed to parse CSV')),
    })
  })
}

// ── Header-row detection ─────────────────────────────────────────────────────
// Many real exports (Monday.com, Pipedrive, etc.) prepend metadata rows before
// the real header — a single-cell board title, a "Generated on …" line, even a
// two-cell label like "Board:" "<name>". We score each candidate row by how
// header-shaped it is, and confirm by comparing to the row below (data should
// look different from a header).

function isLikelyHeaderRow(row: string[]): { score: number; populated: number } {
  let populated = 0
  let shortAndAlpha = 0
  for (const c of row) {
    const v = `${c ?? ''}`.trim()
    if (!v) continue
    populated++
    if (v.length <= MAX_HEADER_LEN && /[a-zA-Z]/.test(v)) shortAndAlpha++
  }
  if (populated === 0) return { score: 0, populated: 0 }
  // A header row: >=2 populated cells, and most of those look label-shaped.
  if (populated < 2) return { score: 0, populated }
  const ratio = shortAndAlpha / populated
  return { score: populated * ratio, populated }
}

function looksLikeDataRow(row: string[], headerArity: number): boolean {
  let populated = 0
  for (const c of row) if (`${c ?? ''}`.trim() !== '') populated++
  // Data rows usually populate at least half of the header's columns.
  return populated >= Math.max(1, Math.floor(headerArity / 2))
}

/**
 * Pick the header row. Skip up to MAX_HEADER_SCAN metadata rows above by
 * scoring each candidate and confirming the row below it looks like data.
 *
 * Header cells that are genuinely blank are returned as '' — downstream callers
 * decide how to surface them (the importer flags them as "name this column").
 */
export function splitHeaderRows(all: string[][]): { headers: string[]; rows: string[][] } {
  let bestStart = 0
  let bestScore = -1

  const scanLimit = Math.min(MAX_HEADER_SCAN, all.length)
  for (let i = 0; i < scanLimit; i++) {
    const cand = isLikelyHeaderRow(all[i] ?? [])
    if (cand.score === 0) continue
    const next = all[i + 1]
    const confirmed = next ? looksLikeDataRow(next, cand.populated) : true
    // Prefer the FIRST high-scoring row that has a plausible data row below it.
    // Tiebreak by score so a much-richer row further down can still win.
    const effective = cand.score + (confirmed ? 1 : 0) - i * 0.01
    if (effective > bestScore) {
      bestScore = effective
      bestStart = i
    }
  }

  const headerRow = all[bestStart] ?? []
  const headers = headerRow.map((h) => `${h ?? ''}`.trim())
  const rows = all.slice(bestStart + 1)
  return { headers, rows }
}
