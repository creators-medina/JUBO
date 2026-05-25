'use client'

import Papa from 'papaparse'
import type { ParsedSheet } from '../types'

const MAX_ROWS = 5000

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

/**
 * Pick the header row. Monday.com exports prepend a single-cell board-title row
 * before the real header — skip a leading row that has only one non-empty cell.
 */
export function splitHeaderRows(all: string[][]): { headers: string[]; rows: string[][] } {
  let start = 0
  const firstNonEmpty = all[0].filter((c) => `${c ?? ''}`.trim() !== '')
  if (firstNonEmpty.length === 1 && all.length > 1 && all[1].filter((c) => `${c ?? ''}`.trim() !== '').length > 1) {
    start = 1 // leading title row (Monday-style)
  }
  const headers = (all[start] ?? []).map((h, i) => `${h ?? ''}`.trim() || `Column ${i + 1}`)
  const rows = all.slice(start + 1)
  return { headers, rows }
}
