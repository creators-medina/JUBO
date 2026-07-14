// ─────────────────────────────────────────────────────────────────────────
// Theme-day roster diagnostic — READ-ONLY, admin-only.
//
// Reuses the REAL Daily Call Log logic to avoid drift:
//   • buildThemeDayData() — the actual roster builder; its per-day `boards`
//     (schedule-resolved effective source) and `items` (final roster) are the
//     ground truth for "is she sourced / does she appear".
//   • getProspectingSchedule() — the real effective schedule.
//   • DAY_BOARD_SPECS / squashBoardName — the real playbook matcher.
// Everything else here is read-only lookups purely to EXPLAIN the outcome.
// No writes, no schema, no service-role.
// ─────────────────────────────────────────────────────────────────────────

import { requireOrgRole } from '@/features/auth/guards'
import { buildThemeDayData } from './queues'
import { getProspectingSchedule } from '../schedule/queries'
import { DAY_BOARD_SPECS, squashBoardName } from './matchers'
import { classifyDiagnosis, type DiagnosisCode } from './diagnoseClassify'

const MAX_MATCHES = 25
const ROSTER_CAP = 500 // mirrors MAX_RECORDS in queues.ts (the Daily Call Log cap)

export type EffectiveMode = 'playbook' | 'any' | 'off' | 'boards'

export type DiagnosisRecord = {
  title: string
  recordId: string
  boardName: string
  boardId: string | null
  stageGroup: string | null
  groupId: string | null
  organizationId: string
  ownerUserId: string | null
  assignedUserId: string | null
  createdBy: string | null
  // record-level checks
  passInMyOrg: boolean
  passNotArchived: boolean
  passStatusActive: boolean
  passTopLevel: boolean
  hasDoNotContact: boolean
  recordEligible: boolean
  // source checks
  boardMatchesPlaybook: boolean
  boardInEffectiveSource: boolean
  // roster / cap
  qualifiesPreCap: boolean
  estRankByTitle: number | null
  withinCap: boolean | null
  diagnosis: DiagnosisCode
}

export type ThemeDayDiagnosis = {
  weekday: number
  query: string
  schedule: {
    userRowExists: boolean
    orgDefaultExists: boolean
    source: 'user' | 'org_default' | 'none'
    effectiveMode: EffectiveMode
  }
  effectiveSourceBoards: { id: string; name: string }[]
  missingBoards: string[]
  rosterTotal: number
  tuesday: { includesLoanInProcess: boolean; includesInactive: boolean } | null
  records: DiagnosisRecord[]
}

export async function diagnoseThemeDay(query: string, weekday: number): Promise<ThemeDayDiagnosis | { error: string }> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch {
    return { error: 'forbidden' }
  }
  const { supabase, orgId, user } = ctx
  const userId = user.id

  // 1. REAL Daily Call Log logic → effective source boards + final roster.
  const data = await buildThemeDayData(orgId, userId)
  const dayQ = data.days[weekday] ?? { weekday, boards: [], missingBoards: [], items: [] }
  const sourceBoardIds = new Set(dayQ.boards.map((b) => b.id))
  const inRoster = new Set(dayQ.items.map((i) => i.recordId))
  const srcIds = [...sourceBoardIds]

  // 2. Effective schedule (real) + user/org-default existence.
  const { schedule, source } = await getProspectingSchedule(orgId, userId)
  const daySched = schedule.enabled ? schedule.week[weekday] : undefined
  const effectiveMode: EffectiveMode =
    source === 'none' || !schedule.enabled ? 'playbook'
      : daySched?.mode === 'off' ? 'off'
        : daySched?.mode === 'boards' && daySched.boardIds.length > 0 ? 'boards'
          : 'any'
  const { data: schedRows } = await supabase.from('prospecting_schedules').select('user_id').eq('organization_id', orgId)
  const userRowExists = (schedRows ?? []).some((r) => (r as { user_id: string | null }).user_id === userId)
  const orgDefaultExists = (schedRows ?? []).some((r) => (r as { user_id: string | null }).user_id === null)

  // 3. Tuesday-specific context (weekday 2) — via the real squash matcher.
  const tuesday = weekday === 2
    ? {
        includesLoanInProcess: dayQ.boards.some((b) => squashBoardName(b.name).includes('inprocess')),
        includesInactive: dayQ.boards.some((b) => squashBoardName(b.name).includes('inactive')),
      }
    : null

  // 4. Day roster total (pre-cap) — mirrors the exact queues.ts record filters.
  let rosterTotal = 0
  if (srcIds.length) {
    const { count } = await supabase
      .from('records').select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId).in('board_id', srcIds)
      .eq('is_archived', false).eq('status', 'active').is('parent_record_id', null)
    rosterTotal = count ?? 0
  }

  const q = query.trim()
  const base: Omit<ThemeDayDiagnosis, 'records'> = {
    weekday, query: q,
    schedule: { userRowExists, orgDefaultExists, source, effectiveMode },
    effectiveSourceBoards: dayQ.boards.map((b) => ({ id: b.id, name: b.name })),
    missingBoards: dayQ.missingBoards,
    rosterTotal, tuesday,
  }
  if (!q) return { ...base, records: [] }

  // 5. Matching records in THIS org (RLS + explicit org filter).
  const { data: recs } = await supabase
    .from('records')
    .select('id, title, board_id, group_id, status, is_archived, parent_record_id, owner_user_id, assigned_user_id, created_by, organization_id')
    .eq('organization_id', orgId)
    .ilike('title', `%${q}%`)
    .order('title', { ascending: true })
    .limit(MAX_MATCHES)
  const records = (recs ?? []) as Array<{
    id: string; title: string; board_id: string | null; group_id: string | null; status: string
    is_archived: boolean; parent_record_id: string | null; owner_user_id: string | null
    assigned_user_id: string | null; created_by: string | null; organization_id: string
  }>
  const recIds = records.map((r) => r.id)

  const boardIds = [...new Set(records.map((r) => r.board_id).filter(Boolean) as string[])]
  const groupIds = [...new Set(records.map((r) => r.group_id).filter(Boolean) as string[])]
  const boardName = new Map<string, string>()
  const groupName = new Map<string, string>()
  if (boardIds.length) {
    const { data: b } = await supabase.from('boards').select('id, name').in('id', boardIds)
    for (const row of b ?? []) boardName.set(row.id as string, row.name as string)
  }
  if (groupIds.length) {
    const { data: g } = await supabase.from('board_groups').select('id, name').in('id', groupIds)
    for (const row of g ?? []) groupName.set(row.id as string, row.name as string)
  }

  const dnc = new Set<string>()
  if (recIds.length) {
    const { data: logs } = await supabase.from('communication_logs').select('record_id').in('record_id', recIds).eq('outcome', 'do_not_contact')
    for (const l of logs ?? []) dnc.add((l as { record_id: string }).record_id)
  }

  const out: DiagnosisRecord[] = []
  for (const r of records) {
    const passNotArchived = r.is_archived === false
    const passStatusActive = r.status === 'active'
    const passTopLevel = r.parent_record_id == null
    const hasDoNotContact = dnc.has(r.id)
    const bName = r.board_id ? (boardName.get(r.board_id) ?? '') : ''
    const boardInEffectiveSource = r.board_id ? sourceBoardIds.has(r.board_id) : false
    const boardMatchesPlaybook = (DAY_BOARD_SPECS[weekday] ?? []).some((spec) => spec.match(squashBoardName(bName)))
    const inFinalRoster = inRoster.has(r.id)
    const qualifiesPreCap = passNotArchived && passStatusActive && passTopLevel && !hasDoNotContact && boardInEffectiveSource

    // Estimated rank by title (only meaningful when she'd otherwise qualify).
    let estRankByTitle: number | null = null
    let withinCap: boolean | null = null
    if (qualifiesPreCap && srcIds.length) {
      const { count } = await supabase
        .from('records').select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId).in('board_id', srcIds)
        .eq('is_archived', false).eq('status', 'active').is('parent_record_id', null)
        .lt('title', r.title)
      estRankByTitle = (count ?? 0) + 1
      withinCap = estRankByTitle <= ROSTER_CAP
    }

    const diagnosis = classifyDiagnosis({
      inFinalRoster, notArchived: passNotArchived, statusActive: passStatusActive,
      topLevel: passTopLevel, hasDoNotContact, boardInEffectiveSource, effectiveMode,
      qualifiesPreCap, withinCap,
    })

    out.push({
      title: r.title, recordId: r.id,
      boardName: bName || '—', boardId: r.board_id,
      stageGroup: r.group_id ? (groupName.get(r.group_id) ?? null) : null, groupId: r.group_id,
      organizationId: r.organization_id,
      ownerUserId: r.owner_user_id, assignedUserId: r.assigned_user_id, createdBy: r.created_by,
      passInMyOrg: r.organization_id === orgId,
      passNotArchived, passStatusActive, passTopLevel, hasDoNotContact,
      recordEligible: passNotArchived && passStatusActive && passTopLevel && !hasDoNotContact,
      boardMatchesPlaybook, boardInEffectiveSource,
      qualifiesPreCap, estRankByTitle, withinCap, diagnosis,
    })
  }

  return { ...base, records: out }
}
