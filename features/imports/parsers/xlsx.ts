'use client'

import * as XLSX from 'xlsx'
import type { ParsedSheet } from '../types'
import { splitHeaderRows } from './csv'

const MAX_ROWS = 5000

/** Parse an XLSX/XLS file into one ParsedSheet per worksheet. */
export async function parseXlsx(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheets: ParsedSheet[] = []

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    if (!ws) continue
    // header:1 → array-of-arrays; defval keeps column alignment for blank cells
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', blankrows: false })
    const all = (aoa as unknown[][])
      .map((r) => r.map((c) => (c == null ? '' : String(c))))
      .filter((r) => r.some((c) => c.trim() !== ''))
    if (all.length === 0) continue
    const { headers, rows } = splitHeaderRows(all)
    sheets.push({ name, headers, rows: rows.slice(0, MAX_ROWS) })
  }

  if (sheets.length === 0) throw new Error('No data found in the workbook.')
  return sheets
}
