'use client'

import { parseCsv } from './csv'
import { parseXlsx } from './xlsx'
import type { ParsedFile, ParsedSheet, ImportSourceType } from '../types'

const MAX_FILE_BYTES = 15 * 1024 * 1024 // 15 MB upload cap

const MONDAY_SIGNALS = ['person', 'status', 'owner', 'priority', 'timeline', 'date created', 'last updated', 'subitems']

/** Heuristic: does this sheet look like a Monday.com export? */
export function detectMonday(sheet: ParsedSheet): boolean {
  const lower = sheet.headers.map((h) => h.toLowerCase().trim())
  const hasName = lower.includes('name')
  const signalHits = MONDAY_SIGNALS.filter((s) => lower.includes(s)).length
  return hasName && signalHits >= 2
}

/** Parse any supported file into the unified ParsedFile shape. */
export async function parseFile(file: File): Promise<ParsedFile> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File is too large (max 15 MB). Split it into smaller files.')
  }

  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  let sheets: ParsedSheet[]
  let sourceType: ImportSourceType

  if (ext === 'csv' || file.type === 'text/csv') {
    sheets = [await parseCsv(file)]
    sourceType = 'csv'
  } else if (ext === 'xlsx' || ext === 'xls' || file.type.includes('spreadsheetml')) {
    sheets = await parseXlsx(file)
    sourceType = 'xlsx'
  } else {
    throw new Error('Unsupported file type. Upload a .csv or .xlsx file.')
  }

  const isMonday = sheets.length > 0 && detectMonday(sheets[0])
  return {
    sourceType: isMonday ? 'monday' : sourceType,
    fileName: file.name,
    sheets,
    isMonday,
  }
}

export { parseCsv, parseXlsx }
