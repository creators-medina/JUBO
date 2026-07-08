// ─────────────────────────────────────────────────────────────────────────
// Greatness Tracker — Phase 2 read-only aggregation.
//
// The scoreboard below the Daily Call Log: is daily activity turning into
// leads, pre-approvals, pipeline, and funded loans? Everything here is
// derived from live CRM data with zero writes and zero schema changes.
//
// Metric sources (see docs/JUBO_PRODUCT_DECISIONS.md):
// • Calls Made      — real communication_logs (channel='call'), per-LO via
//                     created_by; the same rows the Daily Call Log counts.
// • New Leads       — record_movements INTO the Initial Consult board, plus
//                     a created-in-board fallback for records that were
//                     created (or imported) directly there.
// • Credit Pulls    — not trackable yet (future integration); never faked.
// • Pre-Approvals   — entries into the Pre-Approved board OR any runtime-
//                     detected pre-approval-named stage, deduped by record.
// • Deals in Pipeline — Loan In Process roster (current-state) + entries
//                     over time from movement history.
// • Funded Loans    — movements into funded/closed/post-closing stages on
//                     the Closing board (there is no Funded board). Movement
//                     created_at is the funded date — updated_at is NOT used.
//
// Honesty rules: movement history only covers in-app moves since the table
// existed, so historical counts are labeled as movement-based. Record
// metrics scope per-LO only when every counted record has a resolvable
// owner (owner_user_id → assigned_user_id → created_by); otherwise they
// fall back to org-wide with an explicit "All records" label. Every query
// is bounded (PR #50 lesson).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'

export type GreatnessWindowKey = 'today' | 'week' | 'month' | 'year'
export const GREATNESS_WINDOWS: GreatnessWindowKey[] = ['today', 'week', 'month', 'year']

export type GreatnessCounts = Record<GreatnessWindowKey, number>

/** How a record-based metric is scoped (calls are always per-LO). */
export type MetricScope = 'per_lo' | 'all_records'

export type EntryMetric = {
  /** Distinct records that ENTERED the metric's state, per window. */
  entries: GreatnessCounts
  scope: MetricScope
}

export type GreatnessData = {
  calls: GreatnessCounts
  newLeads: (EntryMetric & { usedCreatedFallback: boolean }) | null
  preApprovals: (EntryMetric & { currentCount: number; stageNames: string[] }) | null
  pipeline: (EntryMetric & { currentCount: number }) | null
  funded: (EntryMetric & { stageNames: string[] }) | null
  /** Canonical board/stage mappings that could not be found (reported, never faked). */
  missing: string[]
  /** True if the year-window movement scan hit its hard bound. */
  movementsTruncated: boolean
}

// Same funded/closed stage-name convention as the Dashboard home
// (features/dashboards/overview/queries.ts) — the app's single definition
// of "this stage means the loan is done".
const CLOSED_GROUP_WORDS = ['funded', 'closed', 'post closing', 'post-closing']
const isClosedGroupName = (name: string | null | undefined): boolean => {
  if (!name) return false
  const n = name.toLowerCase()
  return CLOSED_GROUP_WORDS.some((w) => n.includes(w))
}

// Board matching follows the theme-day convention: real names, squashed.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

const MAX_RECORDS = 2000
const MAX_MOVEMENTS = 5000

function startOfToday(now: Date): Date { const x = new Date(now); x.setHours(0, 0, 0, 0); return x }
function startOfWeek(now: Date): Date {
  const x = startOfToday(now); const dow = x.getDay()
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1)); return x
}
function startOfMonth(now: Date): Date { const x = startOfToday(now); x.setDate(1); return x }
function startOfYear(now: Date): Date { const x = startOfToday(now); x.setMonth(0, 1); return x }

type EntryEvent = { recordId: string; at: string }

/** Distinct records with an entry event in each window. */
function countPerWindow(entries: EntryEvent[], starts: Record<GreatnessWindowKey, Date>): GreatnessCounts {
  const counts = {} as GreatnessCounts
  for (const w of GREATNESS_WINDOWS) {
    const s = starts[w].getTime()
    const ids = new Set<string>()
    for (const e of entries) if (new Date(e.at).getTime() >= s) ids.add(e.recordId)
    counts[w] = ids.size
  }
  return counts
}

export async function buildGreatnessData(organizationId: string, userId: string): Promise<GreatnessData> {
  const supabase = await createClient()
  const now = new Date()
  const starts: Record<GreatnessWindowKey, Date> = {
    today: startOfToday(now), week: startOfWeek(now), month: startOfMonth(now), year: startOfYear(now),
  }

  // ── Calls Made: bounded head-count queries per window — no row transfer.
  // Same definition as the Daily Call Log ring: this user's real call logs
  // (quickCallOutcome → communication_logs, channel='call'), by occurred_at.
  const countCalls = async (since: Date): Promise<number> => {
    const { count } = await supabase
      .from('communication_logs')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('created_by', userId)
      .eq('channel', 'call')
      .gte('occurred_at', since.toISOString())
    return count ?? 0
  }

  const [boardsRes, groupsRes, callsToday, callsWeek, callsMonth, callsYear] = await Promise.all([
    supabase.from('boards').select('id, name').eq('organization_id', organizationId).eq('is_archived', false),
    supabase.from('board_groups').select('id, board_id, name').eq('organization_id', organizationId),
    countCalls(starts.today), countCalls(starts.week), countCalls(starts.month), countCalls(starts.year),
  ])
  const calls: GreatnessCounts = { today: callsToday, week: callsWeek, month: callsMonth, year: callsYear }

  const boards = (boardsRes.data ?? []) as { id: string; name: string }[]
  const groups = (groupsRes.data ?? []) as { id: string; board_id: string; name: string }[]

  // ── Board classification (real names only — missing boards are reported).
  const boardIdsWhere = (match: (n: string) => boolean) => boards.filter((b) => match(squash(b.name))).map((b) => b.id)
  const icBoardIds = new Set(boardIdsWhere((n) => n.includes('initialconsult')))
  const paBoardIds = new Set(boardIdsWhere((n) => n.includes('preapp')))
  const lipBoardIds = new Set(boardIdsWhere((n) => n.includes('inprocess')))
  const closingBoardIds = new Set(boardIdsWhere((n) => n.includes('closing')))

  const missing: string[] = []
  if (icBoardIds.size === 0) missing.push('Initial Consult board')
  if (paBoardIds.size === 0) missing.push('Pre-Approved board')
  if (lipBoardIds.size === 0) missing.push('Loan In Process board')
  if (closingBoardIds.size === 0) missing.push('Closing board')

  // ── Stage classification.
  // Pre-approval-named stages OUTSIDE the Pre-Approved board (runtime data —
  // detected, never assumed); the Pre-Approved board's own groups all count.
  const icGroupIds = new Set(groups.filter((g) => icBoardIds.has(g.board_id)).map((g) => g.id))
  const paStageGroups = groups.filter((g) => !paBoardIds.has(g.board_id) && squash(g.name).includes('preapprov'))
  const paGroupIds = new Set([
    ...groups.filter((g) => paBoardIds.has(g.board_id)).map((g) => g.id),
    ...paStageGroups.map((g) => g.id),
  ])
  const paStageNames = [...new Set(paStageGroups.map((g) => g.name))]
  // Pipeline = Loan In Process OPEN stages (a funded/closed-named stage on
  // that board is not "in pipeline" — same rule as the Dashboard pipeline).
  const lipGroupIds = new Set(groups.filter((g) => lipBoardIds.has(g.board_id) && !isClosedGroupName(g.name)).map((g) => g.id))
  const fundedGroups = groups.filter((g) => closingBoardIds.has(g.board_id) && isClosedGroupName(g.name))
  const fundedGroupIds = new Set(fundedGroups.map((g) => g.id))
  const fundedStageNames = [...new Set(fundedGroups.map((g) => g.name))]
  if (closingBoardIds.size > 0 && fundedGroupIds.size === 0) missing.push('funded/closed stage on the Closing board')

  // Boards whose records we need current-state + ownership for (includes any
  // board that merely hosts a pre-approval-named stage).
  const paStageBoardIds = new Set(paStageGroups.map((g) => g.board_id))
  const relevantBoardIds = [...new Set([...icBoardIds, ...paBoardIds, ...lipBoardIds, ...closingBoardIds, ...paStageBoardIds])]

  const targetGroupIds = [...new Set([...icGroupIds, ...paGroupIds, ...lipGroupIds, ...fundedGroupIds])]

  const [recordsRes, movementsRes] = await Promise.all([
    relevantBoardIds.length > 0
      ? supabase
          .from('records')
          .select('id, board_id, group_id, created_at, owner_user_id, assigned_user_id, created_by')
          .eq('organization_id', organizationId)
          .in('board_id', relevantBoardIds)
          .eq('is_archived', false)
          .eq('status', 'active')
          .is('parent_record_id', null)
          .limit(MAX_RECORDS)
      : Promise.resolve({ data: [] as never[] }),
    targetGroupIds.length > 0
      ? supabase
          .from('record_movements')
          .select('record_id, from_group_id, to_group_id, created_at')
          .eq('organization_id', organizationId)
          .in('to_group_id', targetGroupIds)
          .gte('created_at', starts.year.toISOString())
          // Most-recent first so a truncated scan drops the oldest events —
          // the short windows (today/week) stay exact.
          .order('created_at', { ascending: false })
          .limit(MAX_MOVEMENTS)
      : Promise.resolve({ data: [] as never[] }),
  ])

  type RecordRow = { id: string; board_id: string; group_id: string | null; created_at: string; owner_user_id: string | null; assigned_user_id: string | null; created_by: string | null }
  type MovementRow = { record_id: string; from_group_id: string | null; to_group_id: string; created_at: string }
  const records = (recordsRes.data ?? []) as RecordRow[]
  const movements = (movementsRes.data ?? []) as MovementRow[]
  const movementsTruncated = movements.length >= MAX_MOVEMENTS

  // ── Ownership: owner_user_id → assigned_user_id → created_by. Records that
  // moved onward since their entry aren't in the roster fetch — pull their
  // ownership in bounded chunks so per-LO scoping stays honest.
  const ownerOf = new Map<string, string | null>()
  const resolveOwner = (r: { owner_user_id: string | null; assigned_user_id: string | null; created_by: string | null }) =>
    r.owner_user_id ?? r.assigned_user_id ?? r.created_by ?? null
  for (const r of records) ownerOf.set(r.id, resolveOwner(r))
  const unknownIds = [...new Set(movements.map((m) => m.record_id))].filter((id) => !ownerOf.has(id))
  for (let i = 0; i < unknownIds.length; i += 200) {
    const chunk = unknownIds.slice(i, i + 200)
    const { data: rows } = await supabase
      .from('records')
      .select('id, owner_user_id, assigned_user_id, created_by')
      .eq('organization_id', organizationId)
      .in('id', chunk)
    for (const r of (rows ?? []) as Pick<RecordRow, 'id' | 'owner_user_id' | 'assigned_user_id' | 'created_by'>[]) {
      ownerOf.set(r.id, resolveOwner(r))
    }
  }

  // ── Entry events: a movement INTO the set from OUTSIDE it (stage shuffles
  // within the same set — e.g. funded → post-closing — never re-count).
  const entriesInto = (set: Set<string>): EntryEvent[] =>
    movements
      .filter((m) => set.has(m.to_group_id) && !(m.from_group_id && set.has(m.from_group_id)))
      .map((m) => ({ recordId: m.record_id, at: m.created_at }))

  // Created-in fallback: records created (or imported) directly into the set
  // this year with no arrival movement — their created_at is the entry date.
  const createdInFallback = (inSet: (r: RecordRow) => boolean, moveEntries: EntryEvent[]): EntryEvent[] => {
    const moved = new Set(moveEntries.map((e) => e.recordId))
    const yearStart = starts.year.getTime()
    return records
      .filter((r) => inSet(r) && !moved.has(r.id) && new Date(r.created_at).getTime() >= yearStart)
      .map((r) => ({ recordId: r.id, at: r.created_at }))
  }

  // ── Per-metric scoping: per-LO only when EVERY counted record resolves an
  // owner; any gap → org-wide with the explicit "All records" label. Never
  // silently claim per-LO accuracy.
  const scopeAndCount = (entries: EntryEvent[], extraIds: string[] = []): { entries: GreatnessCounts; scope: MetricScope; filterIds: Set<string> | null } => {
    const candidateIds = [...new Set([...entries.map((e) => e.recordId), ...extraIds])]
    const perLo = candidateIds.length > 0 && candidateIds.every((id) => ownerOf.get(id) != null)
    if (!perLo) return { entries: countPerWindow(entries, starts), scope: 'all_records', filterIds: null }
    const mine = new Set(candidateIds.filter((id) => ownerOf.get(id) === userId))
    return { entries: countPerWindow(entries.filter((e) => mine.has(e.recordId)), starts), scope: 'per_lo', filterIds: mine }
  }

  // ── New Leads: entries into Initial Consult + created-in fallback.
  let newLeads: GreatnessData['newLeads'] = null
  if (icBoardIds.size > 0) {
    const moveEntries = entriesInto(icGroupIds)
    const created = createdInFallback((r) => icBoardIds.has(r.board_id), moveEntries)
    const { entries, scope } = scopeAndCount([...moveEntries, ...created])
    newLeads = { entries, scope, usedCreatedFallback: created.length > 0 }
  }

  // ── Pre-Approvals: Pre-Approved board ∪ pre-approval-named stages, deduped
  // by record_id (a record on the board AND in a named stage counts once —
  // entry events and current-state both collapse through Sets).
  let preApprovals: GreatnessData['preApprovals'] = null
  if (paGroupIds.size > 0) {
    const inPa = (r: RecordRow) => paBoardIds.has(r.board_id) || (r.group_id != null && paGroupIds.has(r.group_id))
    const moveEntries = entriesInto(paGroupIds)
    const created = createdInFallback(inPa, moveEntries)
    const currentIds = new Set(records.filter(inPa).map((r) => r.id))
    const { entries, scope, filterIds } = scopeAndCount([...moveEntries, ...created], [...currentIds])
    const currentCount = filterIds ? [...currentIds].filter((id) => filterIds.has(id)).length : currentIds.size
    preApprovals = { entries, scope, currentCount, stageNames: paStageNames }
  }

  // ── Deals in Pipeline: Loan In Process — current roster (open stages) is
  // the headline; entries over time come from movement history.
  let pipeline: GreatnessData['pipeline'] = null
  if (lipBoardIds.size > 0) {
    const inLip = (r: RecordRow) => lipBoardIds.has(r.board_id) && !(r.group_id != null && !lipGroupIds.has(r.group_id))
    const moveEntries = entriesInto(lipGroupIds)
    const currentIds = new Set(records.filter(inLip).map((r) => r.id))
    const { entries, scope, filterIds } = scopeAndCount(moveEntries, [...currentIds])
    const currentCount = filterIds ? [...currentIds].filter((id) => filterIds.has(id)).length : currentIds.size
    pipeline = { entries, scope, currentCount }
  }

  // ── Funded Loans: movements into funded/closed/post-closing stages on the
  // Closing board. Movement created_at IS the funded date (never updated_at).
  // No created-in fallback here — an import date is not a funded date.
  let funded: GreatnessData['funded'] = null
  if (fundedGroupIds.size > 0) {
    const { entries, scope } = scopeAndCount(entriesInto(fundedGroupIds))
    funded = { entries, scope, stageNames: fundedStageNames }
  }

  return { calls, newLeads, preApprovals, pipeline, funded, missing, movementsTruncated }
}
