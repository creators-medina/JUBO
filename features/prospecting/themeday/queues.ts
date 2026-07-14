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
import { mondayOf } from '@/features/metrics/shared'
import { DAY_BOARD_SPECS, squashBoardName as squash, type ThemeBoardKind } from './matchers'
import { getProspectingSchedule } from '../schedule/queries'

export type { ThemeBoardKind }

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

// Board matchers per weekday live in ./matchers (pure, unit-tested). Matching is
// by real board name only; DAY_BOARD_SPECS + squash are imported above.
const MAX_RECORDS = 500

function startOfWeekISO(): string {
  return mondayOf(new Date()).toISOString() // shared Monday-week helper
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

  // Phase Hybrid — the user's EDITABLE per-day board schedule overrides the
  // playbook. Per weekday: an explicit board selection (by ID) wins; a day set
  // to 'off' is empty; anything else falls back to the DAY_BOARD_SPECS
  // name-matched playbook, so seeded / Medina orgs behave exactly as before.
  const { schedule } = await getProspectingSchedule(organizationId, userId)
  const boardById = new Map(boards.map((b) => [b.id, b]))

  for (const weekday of [1, 2, 3, 4, 5]) {
    const matched: ThemeSourceBoard[] = []
    const missing: string[] = []
    const daySched = schedule.enabled ? schedule.week[weekday] : undefined

    if (daySched && daySched.mode === 'boards' && daySched.boardIds.length > 0) {
      // Editable override — the user's chosen boards for this weekday.
      for (const id of daySched.boardIds) {
        const b = boardById.get(id)
        if (!b) { missing.push('(a board you scheduled was removed)'); continue }
        if (!matched.some((m) => m.id === b.id)) {
          matched.push({ id: b.id, name: b.name, kind: 'default' })
          boardKind.set(`${weekday}:${b.id}`, 'default')
        }
      }
    } else if (daySched && daySched.mode === 'off') {
      // Day explicitly turned off — no call list.
    } else {
      // Fallback: the DAY_BOARD_SPECS playbook (name-matched).
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
    // Hard bound — the client scans this array to derive per-day completion,
    // so it must never be unbounded (a bulk-imported history could otherwise
    // freeze the dashboard). 2000 manual logs/week is far above real usage.
    .limit(2000)

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
  // Phase Hybrid (A2 outcome-awareness) — records whose recent history has a
  // "don't contact" outcome are dropped from the call list (compliance + focus).
  const suppressed = new Set<string>()
  const SUPPRESS_OUTCOMES = new Set(['do_not_contact', 'not_interested', 'wrong_number'])
  if (recordIds.length > 0) {
    const { data: lcRows } = await supabase
      .from('communication_logs')
      .select('record_id, occurred_at, outcome')
      .in('record_id', recordIds)
      .neq('channel', 'internal')
      .order('occurred_at', { ascending: false })
      // Hard bound (operator-audit quick win) — this scan was unbounded. It
      // reads most-recent-first and keeps the FIRST row per record, so with
      // ≤500 roster records a 4000-row window still yields the same
      // last-contact values in practice; only contacts whose latest touch
      // predates 4000 newer logs would show "—" instead of a stale date.
      .limit(4000)
    for (const c of lcRows ?? []) {
      const rid = c.record_id as string
      if (!lastContact.has(rid)) lastContact.set(rid, c.occurred_at as string)
      if (c.outcome && SUPPRESS_OUTCOMES.has(c.outcome as string)) suppressed.add(rid)
    }
  }

  // 4. Assemble per-day queues.
  for (const weekday of [1, 2, 3, 4, 5]) {
    const day = days[weekday]
    const dayBoardIds = new Set(day.boards.map((b) => b.id))
    day.items = records
      .filter((r) => dayBoardIds.has(r.board_id) && !suppressed.has(r.id))
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
