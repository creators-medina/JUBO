// ─────────────────────────────────────────────────────────────────────────
// Theme Day call queues — the Prospecting Dashboard redesign's data layer.
//
// Unlike the scored prospecting queue (a prioritized subset), each weekday
// theme pulls the FULL roster of records from its named source boards:
//   Mon  Realtor Calls   → Realtors / Partners + Realtors (Top 40)
//   Tue  Status Calls    → Loan In Process + Inactive Loans
//   Wed  Pre-Apps        → Pre-Approved
//   Thu  Past Clients    → Past Clients
//   Fri  VIPs            → VIPs
//
// Boards are matched by REAL name (case/punctuation-tolerant — "VIP's",
// "Pre-Approved", "Realtors (Top 40)" all match). Missing boards are
// reported, never faked. Everything here is READ-ONLY: records, stages,
// phone/email field values, and communication_logs (for last contact and
// this week's per-day call counts). No writes, no schema changes.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'

/** Tuesday distinguishes active files from inactive ones for the "play" text. */
export type ThemeBoardKind = 'default' | 'active' | 'inactive'

export type ThemeSourceBoard = { id: string; name: string; kind: ThemeBoardKind }

export type ThemeCallItem = {
  recordId: string
  title: string
  boardId: string
  boardName: string
  boardKind: ThemeBoardKind
  /** Stage/group name, when the record sits in one. */
  stage: string | null
  /** REAL records.priority value ('urgent' | 'high' | ...) — never invented. */
  priority: string | null
  phone: string | null
  email: string | null
  lastContactAt: string | null
}

export type ThemeDayQueue = {
  weekday: number
  boards: ThemeSourceBoard[]
  /** Canonical board names that could not be found in this org. */
  missingBoards: string[]
  items: ThemeCallItem[]
}

/** One of the signed-in user's call/contact logs from this week (Mon 00:00 →). */
export type ThemeWeekLog = { recordId: string; outcome: string | null; channel: string; occurredAt: string }

export type ThemeDayData = {
  days: Record<number, ThemeDayQueue>
  weekLogs: ThemeWeekLog[]
}

// Board matchers per weekday — squashed-name keywords + the canonical names
// reported when nothing matches. Matching is by real board name only.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

type BoardSpec = { canonical: string; kind: ThemeBoardKind; match: (squashedName: string) => boolean }

const DAY_BOARD_SPECS: Record<number, BoardSpec[]> = {
  1: [
    { canonical: 'Realtors / Partners', kind: 'default', match: (n) => n.includes('partner') },
    { canonical: 'Realtors (Top 40)', kind: 'default', match: (n) => n.includes('realtor') },
  ],
  2: [
    { canonical: 'Loan In Process', kind: 'active', match: (n) => n.includes('inprocess') },
    { canonical: 'Inactive Loans', kind: 'inactive', match: (n) => n.includes('inactive') },
  ],
  3: [{ canonical: 'Pre-Approved', kind: 'default', match: (n) => n.includes('preapp') }],
  4: [{ canonical: 'Past Clients', kind: 'default', match: (n) => n.includes('pastclient') }],
  5: [{ canonical: 'VIPs', kind: 'default', match: (n) => n.includes('vip') }],
}

const MAX_RECORDS = 500

function startOfWeekISO(): string {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)) // back to Monday
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export async function buildThemeDayData(organizationId: string, userId: string): Promise<ThemeDayData> {
  const supabase = await createClient()

  // 1. Real boards → per-day matches (a board may serve multiple days; fine).
  const { data: boardRows } = await supabase
    .from('boards')
    .select('id, name')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
  const boards = (boardRows ?? []) as { id: string; name: string }[]

  const days: Record<number, ThemeDayQueue> = {}
  const boardKind = new Map<string, ThemeBoardKind>()
  for (const weekday of [1, 2, 3, 4, 5]) {
    const matched: ThemeSourceBoard[] = []
    const missing: string[] = []
    for (const spec of DAY_BOARD_SPECS[weekday]) {
      const hits = boards.filter((b) => spec.match(squash(b.name)))
      if (hits.length === 0) missing.push(spec.canonical)
      for (const b of hits) {
        if (!matched.some((m) => m.id === b.id)) {
          matched.push({ id: b.id, name: b.name, kind: spec.kind })
          boardKind.set(`${weekday}:${b.id}`, spec.kind)
        }
      }
    }
    days[weekday] = { weekday, boards: matched, missingBoards: missing, items: [] }
  }

  const allBoardIds = [...new Set(Object.values(days).flatMap((d) => d.boards.map((b) => b.id)))]

  // This week's call/contact logs by the signed-in user — powers the week
  // strip counts and today's completion state (real communication_logs).
  const weekLogsPromise = supabase
    .from('communication_logs')
    .select('record_id, outcome, channel, occurred_at')
    .eq('organization_id', organizationId)
    .eq('created_by', userId)
    .neq('channel', 'internal')
    .gte('occurred_at', startOfWeekISO())
    .order('occurred_at', { ascending: true })

  if (allBoardIds.length === 0) {
    const { data: logRows } = await weekLogsPromise
    return { days, weekLogs: mapLogs(logRows) }
  }

  // 2. Full rosters: every active, top-level record on the matched boards.
  const [recordsRes, groupsRes, fieldsRes, logsRes] = await Promise.all([
    supabase
      .from('records')
      .select('id, title, board_id, group_id, priority')
      .eq('organization_id', organizationId)
      .in('board_id', allBoardIds)
      .eq('is_archived', false)
      .eq('status', 'active')
      .is('parent_record_id', null)
      .order('title', { ascending: true })
      .limit(MAX_RECORDS),
    supabase.from('board_groups').select('id, name').in('board_id', allBoardIds),
    supabase.from('fields').select('id, field_type').in('board_id', allBoardIds).in('field_type', ['phone', 'email']),
    weekLogsPromise,
  ])

  const records = (recordsRes.data ?? []) as { id: string; title: string; board_id: string; group_id: string | null; priority: string | null }[]
  const groupName = new Map((groupsRes.data ?? []).map((g) => [g.id as string, g.name as string]))
  const boardName = new Map(boards.map((b) => [b.id, b.name]))
  const recordIds = records.map((r) => r.id)

  // 3. Phone/email field values + last contact (org-wide, any channel/user).
  const phoneFieldIds = (fieldsRes.data ?? []).filter((f) => f.field_type === 'phone').map((f) => f.id as string)
  const emailFieldIds = (fieldsRes.data ?? []).filter((f) => f.field_type === 'email').map((f) => f.id as string)
  const phoneByRecord = new Map<string, string>()
  const emailByRecord = new Map<string, string>()
  const fieldIds = [...phoneFieldIds, ...emailFieldIds]
  if (fieldIds.length > 0 && recordIds.length > 0) {
    const { data: fvs } = await supabase
      .from('field_values')
      .select('record_id, field_id, value_text')
      .in('field_id', fieldIds)
      .in('record_id', recordIds)
    const phoneSet = new Set(phoneFieldIds)
    for (const fv of fvs ?? []) {
      if (!fv.value_text) continue
      const m = phoneSet.has(fv.field_id as string) ? phoneByRecord : emailByRecord
      if (!m.has(fv.record_id as string)) m.set(fv.record_id as string, fv.value_text as string)
    }
  }

  const lastContact = new Map<string, string>()
  if (recordIds.length > 0) {
    const { data: lcRows } = await supabase
      .from('communication_logs')
      .select('record_id, occurred_at')
      .in('record_id', recordIds)
      .neq('channel', 'internal')
      .order('occurred_at', { ascending: false })
    for (const c of lcRows ?? []) {
      if (!lastContact.has(c.record_id as string)) lastContact.set(c.record_id as string, c.occurred_at as string)
    }
  }

  // 4. Assemble per-day queues.
  for (const weekday of [1, 2, 3, 4, 5]) {
    const day = days[weekday]
    const dayBoardIds = new Set(day.boards.map((b) => b.id))
    day.items = records
      .filter((r) => dayBoardIds.has(r.board_id))
      .map((r) => ({
        recordId: r.id,
        title: r.title,
        boardId: r.board_id,
        boardName: boardName.get(r.board_id) ?? '—',
        boardKind: boardKind.get(`${weekday}:${r.board_id}`) ?? 'default',
        stage: r.group_id ? (groupName.get(r.group_id) ?? null) : null,
        priority: r.priority ?? null,
        phone: phoneByRecord.get(r.id) ?? null,
        email: emailByRecord.get(r.id) ?? null,
        lastContactAt: lastContact.get(r.id) ?? null,
      }))
  }

  return { days, weekLogs: mapLogs(logsRes.data) }
}

function mapLogs(rows: unknown): ThemeWeekLog[] {
  return ((rows as Array<{ record_id: string; outcome: string | null; channel: string; occurred_at: string }>) ?? []).map((r) => ({
    recordId: r.record_id,
    outcome: r.outcome,
    channel: r.channel,
    occurredAt: r.occurred_at,
  }))
}
