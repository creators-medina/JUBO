import { createClient } from '@/lib/supabase/server'
import type { NoteRow } from '../types'

export async function getNotesForRecord(recordId: string): Promise<NoteRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
  return (data ?? []) as NoteRow[]
}

// ── Phase 35A — board notes column summary ──────────────────────────────────
// Read-only aggregation over the EXISTING notes table so the board grid can
// show a compact count + last activity per record. No new storage — the notes
// column is a presentation layer on top of the existing notes system.

export type NotesSummary = {
  count: number
  lastUpdatedAt: string
  lastAuthorName: string | null
  recent: boolean   // updated within the last 24h (computed server-side)
}

/** Per-record notes summary (count, last update, last author) for visible records. */
export async function getNotesSummaryForRecords(recordIds: string[]): Promise<Record<string, NotesSummary>> {
  if (recordIds.length === 0) return {}
  const supabase = await createClient()

  const { data } = await supabase
    .from('notes')
    .select('record_id, updated_at, author_user_id')
    .in('record_id', recordIds)
    .order('updated_at', { ascending: false })

  const rows = (data as { record_id: string; updated_at: string; author_user_id: string | null }[] | null) ?? []

  // First row per record is the most recent (descending order).
  const agg: Record<string, { count: number; lastUpdatedAt: string; lastAuthorId: string | null }> = {}
  for (const r of rows) {
    const cur = agg[r.record_id]
    if (!cur) agg[r.record_id] = { count: 1, lastUpdatedAt: r.updated_at, lastAuthorId: r.author_user_id }
    else cur.count++
  }

  // Resolve last-author display names in one batch.
  const authorIds = [...new Set(Object.values(agg).map((a) => a.lastAuthorId).filter(Boolean) as string[])]
  const names: Record<string, string> = {}
  if (authorIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name').in('id', authorIds)
    for (const p of (profs as { id: string; first_name: string | null; last_name: string | null }[] | null) ?? []) {
      const full = [p.first_name, p.last_name].filter(Boolean).join(' ')
      if (full) names[p.id] = full
    }
  }

  const now = Date.now()
  const out: Record<string, NotesSummary> = {}
  for (const [recordId, a] of Object.entries(agg)) {
    out[recordId] = {
      count: a.count,
      lastUpdatedAt: a.lastUpdatedAt,
      lastAuthorName: a.lastAuthorId ? (names[a.lastAuthorId] ?? null) : null,
      recent: now - new Date(a.lastUpdatedAt).getTime() < 24 * 60 * 60 * 1000,
    }
  }
  return out
}
