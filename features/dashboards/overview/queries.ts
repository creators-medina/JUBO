// ─────────────────────────────────────────────────────────────────────────
// Dashboard overview — the /dashboard home screen's read-only data layer
// (Claude Design "Dashboard.dc.html" handoff). Everything is derived from
// live CRM data; nothing is invented:
//
// • KPIs (week/month/quarter + prior-period deltas):
//     funded volume/units — records sitting in funded/closed stages whose
//       last update falls in the window (updated_at is the best available
//       funded-at proxy; there is no funded_at column)
//     commission — summed from a real "commission" currency field when one
//       exists; otherwise null → the card shows "—"
//     new leads — records created in the window on non-pipeline boards
// • Pipeline — per work-loans board: active count + loan total through the
//   shared loan-amount resolver (same source of truth as everywhere else)
// • Theme day — today's theme + real called/goal (shared with Prospecting)
// • Upcoming closings — real close-date field values in the next 30 days
// • Monthly goal — production_goals targets vs this month's funded actuals
// • Recent activity — the existing activities feed
// • Follow-ups — open follow-ups due (communication_logs)
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { pickLoanAmountFieldId, loanAmountForSum } from '@/features/fields/loanAmount'
import { isWorkLoansBoard } from '@/features/boards/components/DynamicBoardsSidebarSection'
import { getFollowUpsDue, type FollowUpDueItem } from '@/features/communications/queries'
import { getProductionGoals } from '@/features/goals/queries'
import { buildThemeDayData } from '@/features/prospecting/themeday/queues'
import { getThemeDayFor } from '@/features/prospecting/coaching/themeDay'
import { isClosedGroupName, mondayOf, startOfMonthOf, startOfQuarterOf } from '@/features/metrics/shared'

const MAX_RECORDS = 2000

export type PeriodKey = 'week' | 'month' | 'quarter'

export type PeriodKpis = {
  funded: number        // funded volume ($) in the period
  units: number         // funded units in the period
  commission: number | null   // null → no commission field exists
  leads: number         // new records on non-pipeline boards
}

export type PipelineStage = { boardId: string; name: string; color: string | null; count: number; money: number }
export type ClosingItem = { recordId: string; name: string; boardName: string; amount: number | null; closeDate: string }
export type ActivityItem = { id: string; type: string; text: string; at: string }

export type DashboardOverviewData = {
  firstName: string
  kpis: Record<PeriodKey, { cur: PeriodKpis; prev: PeriodKpis }>
  pipeline: PipelineStage[]
  theme: { name: string; shortName: string; sources: string[]; done: number; goal: number }
  closings: ClosingItem[]
  goal: { units: number | null; volume: number | null; curUnits: number; curVolume: number } | null
  activity: ActivityItem[]
  followUps: FollowUpDueItem[]
}

// Period boundaries + funded/closed classification come from the shared
// metrics module (features/metrics/shared) — one definition app-wide.

/** [curStart, prevStart] — prev window ends where cur begins. */
function windows(period: PeriodKey, now: Date): [Date, Date] {
  if (period === 'week') {
    const cur = mondayOf(now); const prev = new Date(cur); prev.setDate(prev.getDate() - 7); return [cur, prev]
  }
  if (period === 'month') {
    const cur = startOfMonthOf(now); const prev = new Date(cur); prev.setMonth(prev.getMonth() - 1); return [cur, prev]
  }
  const cur = startOfQuarterOf(now); const prev = new Date(cur); prev.setMonth(prev.getMonth() - 3); return [cur, prev]
}

const isClosedGroup = isClosedGroupName

export async function buildDashboardOverview(organizationId: string, userId: string): Promise<DashboardOverviewData> {
  const supabase = await createClient()
  const now = new Date()

  const [boardsRes, groupsRes, recordsRes, currencyFieldsRes, dateFieldsRes, activityRes, followUps, goals, themeData, userRes] = await Promise.all([
    supabase.from('boards').select('id, name, board_type, color').eq('organization_id', organizationId).eq('is_archived', false),
    supabase.from('board_groups').select('id, board_id, name').eq('organization_id', organizationId),
    supabase
      .from('records')
      .select('id, title, board_id, group_id, value, created_at, updated_at')
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('status', 'active')
      .is('parent_record_id', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_RECORDS),
    supabase
      .from('fields')
      .select('id, board_id, slug, name, field_type, common_field_key_id, is_default_status')
      .eq('organization_id', organizationId)
      .eq('field_type', 'currency'),
    supabase
      .from('fields')
      .select('id, board_id, slug, name')
      .eq('organization_id', organizationId)
      .eq('field_type', 'date')
      .or('slug.eq.target_close_date,slug.ilike.%clos%,name.ilike.%clos%'),
    supabase
      .from('activities')
      .select('id, activity_type, content, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(30),
    getFollowUpsDue(organizationId, 30),
    getProductionGoals(organizationId),
    buildThemeDayData(organizationId, userId),
    supabase.auth.getUser(),
  ])

  const boards = (boardsRes.data ?? []) as { id: string; name: string; board_type: string; color: string | null }[]
  const boardById = new Map(boards.map((b) => [b.id, b]))
  const groupName = new Map((groupsRes.data ?? []).map((g) => [g.id as string, g.name as string]))
  const records = (recordsRes.data ?? []) as { id: string; title: string; board_id: string | null; group_id: string | null; value: number | null; created_at: string; updated_at: string }[]
  const recordIds = records.map((r) => r.id)

  // ── Field values: loan amounts, commission, close dates (one read) ──
  const currencyByBoard = new Map<string, NonNullable<typeof currencyFieldsRes.data>>()
  for (const f of currencyFieldsRes.data ?? []) {
    const arr = currencyByBoard.get(f.board_id as string) ?? []
    arr.push(f); currencyByBoard.set(f.board_id as string, arr)
  }
  const loanFieldIds = new Set<string>()
  for (const arr of currencyByBoard.values()) {
    const id = pickLoanAmountFieldId(arr)
    if (id) loanFieldIds.add(id)
  }
  const commissionFieldIds = new Set(
    (currencyFieldsRes.data ?? [])
      .filter((f) => `${f.slug ?? ''} ${f.name ?? ''}`.toLowerCase().includes('commission'))
      .map((f) => f.id as string),
  )
  const closeFieldIds = new Set((dateFieldsRes.data ?? []).map((f) => f.id as string))

  const loanByRecord = new Map<string, number>()
  const commissionByRecord = new Map<string, number>()
  const closeDateByRecord = new Map<string, string>()
  const allFieldIds = [...loanFieldIds, ...commissionFieldIds, ...closeFieldIds]
  if (allFieldIds.length > 0 && recordIds.length > 0) {
    const { data: fvs } = await supabase
      .from('field_values')
      .select('record_id, field_id, value_number, value_date')
      .in('field_id', allFieldIds)
      .in('record_id', recordIds)
    for (const fv of fvs ?? []) {
      const rid = fv.record_id as string, fid = fv.field_id as string
      if (loanFieldIds.has(fid) && typeof fv.value_number === 'number') loanByRecord.set(rid, fv.value_number)
      if (commissionFieldIds.has(fid) && typeof fv.value_number === 'number') commissionByRecord.set(rid, (commissionByRecord.get(rid) ?? 0) + fv.value_number)
      if (closeFieldIds.has(fid) && fv.value_date) closeDateByRecord.set(rid, fv.value_date as string)
    }
  }
  const loanAmount = (r: { id: string; value: number | null }) => loanAmountForSum(loanByRecord.get(r.id), r.value)

  // ── KPIs per period (+ prior window) ──
  const hasCommissionField = commissionFieldIds.size > 0
  const kpisFor = (start: Date, end: Date): PeriodKpis => {
    let funded = 0, units = 0, commission = 0, leads = 0
    for (const r of records) {
      const board = r.board_id ? boardById.get(r.board_id) : undefined
      if (!board) continue
      const inClosed = isClosedGroup(r.group_id ? groupName.get(r.group_id) : null)
      if (inClosed) {
        const t = new Date(r.updated_at)
        if (t >= start && t < end) {
          units += 1
          funded += loanAmount(r)
          commission += commissionByRecord.get(r.id) ?? 0
        }
      }
      if (!isWorkLoansBoard(board)) {
        const c = new Date(r.created_at)
        if (c >= start && c < end) leads += 1
      }
    }
    return { funded, units, commission: hasCommissionField ? commission : null, leads }
  }
  const kpis = {} as DashboardOverviewData['kpis']
  for (const p of ['week', 'month', 'quarter'] as PeriodKey[]) {
    const [curStart, prevStart] = windows(p, now)
    kpis[p] = { cur: kpisFor(curStart, now), prev: kpisFor(prevStart, curStart) }
  }

  // ── Active pipeline: work-loans boards, count + loan total (open stages) ──
  const pipeline: PipelineStage[] = boards
    .filter((b) => isWorkLoansBoard(b))
    .map((b) => {
      let count = 0, money = 0
      for (const r of records) {
        if (r.board_id !== b.id) continue
        if (isClosedGroup(r.group_id ? groupName.get(r.group_id) : null)) continue
        count += 1
        money += loanAmount(r)
      }
      return { boardId: b.id, name: b.name, color: b.color, count, money }
    })

  // ── Theme day summary (same source as the Prospecting cockpit) ──
  const rawDow = now.getDay()
  const todayDow = rawDow >= 1 && rawDow <= 5 ? rawDow : 1 // weekend → Monday (app convention)
  const themeQueue = themeData.days[todayDow] ?? { boards: [], items: [] }
  const todayKey = now.toDateString()
  const calledIds = new Set<string>()
  const queueIds = new Set(themeQueue.items.map((i) => i.recordId))
  for (const log of themeData.weekLogs) {
    if (queueIds.has(log.recordId) && new Date(log.occurredAt).toDateString() === todayKey) calledIds.add(log.recordId)
  }
  const themeInfo = getThemeDayFor(todayDow)
  const theme = {
    name: themeInfo.label,
    shortName: themeInfo.shortLabel,
    sources: themeQueue.boards.map((b) => b.name),
    done: calledIds.size,
    goal: themeQueue.items.length,
  }

  // ── Upcoming closings: real close-date values in the next 30 days ──
  const in30 = new Date(now); in30.setDate(in30.getDate() + 30)
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const closings: ClosingItem[] = records
    .filter((r) => {
      const d = closeDateByRecord.get(r.id)
      if (!d) return false
      const t = new Date(d)
      return t >= todayStart && t <= in30
    })
    .map((r) => ({
      recordId: r.id,
      name: r.title,
      boardName: r.board_id ? (boardById.get(r.board_id)?.name ?? '') : '',
      amount: loanAmount(r) || null,
      closeDate: closeDateByRecord.get(r.id)!,
    }))
    .sort((a, b) => a.closeDate.localeCompare(b.closeDate))
    .slice(0, 12)

  // ── Monthly goal vs this month's funded actuals ──
  const monthly = goals.find((g) => `${g.timeframe}`.toLowerCase().includes('month') && (g.target_units != null || g.target_volume != null))
    ?? goals.find((g) => g.target_units != null || g.target_volume != null)
  const goal = monthly
    ? { units: monthly.target_units, volume: monthly.target_volume, curUnits: kpis.month.cur.units, curVolume: kpis.month.cur.funded }
    : null

  // ── Recent activity ──
  const activity: ActivityItem[] = ((activityRes.data ?? []) as { id: string; activity_type: string; content: string | null; created_at: string }[])
    .filter((a) => a.content)
    .map((a) => ({ id: a.id, type: a.activity_type, text: a.content!, at: a.created_at }))

  const meta = userRes.data.user?.user_metadata as { full_name?: string } | undefined
  const firstName = (meta?.full_name ?? userRes.data.user?.email ?? '').split(/[\s@]/)[0] || 'there'

  return { firstName, kpis, pipeline, theme, closings, goal, activity, followUps }
}
