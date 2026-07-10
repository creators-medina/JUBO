// ─────────────────────────────────────────────────────────────────────────
// Lead Source & Ownership Coverage — Phase A report (Roadmap Step 8).
//
// READ-ONLY aggregation for the backfill plan's Phase A: measures how much
// of the CRM actually carries lead-source attribution and resolvable
// ownership, so provisioning / alias cleanup / review-queue / backfill
// decisions are made against measured reality. Nothing here writes,
// provisions, infers, or normalizes anything — classification labels are
// display-only and raw stored values are always preserved.
//
// Bounds: records capped at MAX_RECORDS (flagged as truncated when hit);
// field-value reads chunked; the review queue capped at QUEUE_LIMIT.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { displaySourceLabel, LEAD_SOURCE_LABELS } from '@/features/production-plan/calc'
import { isClosedGroupName, isOpenPipelineRecord, startOfDay, startOfYearOf } from '@/features/metrics/shared'
import { detectClosingFundedGroups, entriesIntoSet, distinctEntryIdsInWindow, type MovementRow } from '@/features/metrics/funded'
import { pickLoanAmountFieldId, resolveLoanAmount } from '@/features/fields/loanAmount'
import { classifySource, resolveOwnership, type SourceClass, type OwnerResolution } from './coverageShared'

const MAX_RECORDS = 2000
const QUEUE_LIMIT = 100

type RecordRow = {
  id: string; title: string; board_id: string | null; group_id: string | null
  created_at: string; value: number | null
  owner_user_id: string | null; assigned_user_id: string | null; created_by: string | null
}

export type BoardCoverageRow = {
  boardId: string; boardName: string; hasField: boolean; total: number
  assigned: number; unassigned: number; assignedPct: number
  ownerResolved: number; ownerPct: number
  /** Flag only — this report has no provisioning action by design. */
  setupMayBeNeeded: boolean
}

export type ValueQualityRow = { raw: string; classification: SourceClass; canonicalLabel: string | null; count: number }

export type OwnershipSummary = {
  owner: number; assigned: number; createdBy: number; unresolved: number
  byOwner: { name: string; count: number }[]
  unresolvedByBoard: { boardName: string; count: number }[]
}

export type ReviewRow = {
  recordId: string; title: string; boardName: string; stage: string | null
  rawSource: string | null; classification: SourceClass; resolvedCategory: string | null
  ownerStatus: OwnerResolution; amount: number | null; reason: string
}

/** 10D — per-board lead_source option-list status (read-only here; the
 *  refresh/restore themselves are explicit admin actions). */
export type OptionListRow = {
  fieldId: string; boardId: string; boardName: string
  optionCount: number; missingCanonical: number; legacyOptions: number
  hasSnapshot: boolean; refreshedAt: string | null
}

/** 10E — ownership resolution mix inside each REPORTED metric population
 *  (the records whose ownership actually changes reported numbers).
 *  "Affected" = created-by fallback + unresolved: fixing those is what
 *  turns "All records" scoping into honest per-LO numbers. Read-only. */
export type MetricOwnershipRow = {
  key: 'funded_ytd' | 'open_pipeline' | 'recent_leads'
  label: string
  note: string
  total: number
  owner: number; assigned: number; createdBy: number; unresolved: number
  affected: number
  affectedPct: number
}

export type AffectedRecordRow = {
  population: string; recordId: string; title: string
  boardName: string; stage: string | null; resolution: OwnerResolution
}

export type MetricOwnership = {
  rows: MetricOwnershipRow[]
  affected: AffectedRecordRow[]
  affectedLimited: boolean
}

export type CoverageReport = {
  summary: {
    totalRecords: number; truncated: boolean
    withSource: number; withoutSource: number; sourcePct: number
    ownerResolved: number; ownerUnresolved: number; ownerPct: number
    boardsWithField: number; boardsMissingField: number
  }
  boards: BoardCoverageRow[]
  values: ValueQualityRow[]
  ownership: OwnershipSummary
  queue: ReviewRow[]
  queueLimited: boolean
  optionLists: OptionListRow[]
  metricOwnership: MetricOwnership
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0)

export async function buildLeadSourceCoverage(organizationId: string): Promise<CoverageReport> {
  const supabase = await createClient()

  const [boardsRes, groupsRes, lsFieldsRes, recordsRes, currencyFieldsRes] = await Promise.all([
    supabase.from('boards').select('id, name').eq('organization_id', organizationId).eq('is_archived', false),
    supabase.from('board_groups').select('id, board_id, name').eq('organization_id', organizationId),
    supabase.from('fields').select('id, board_id, config').eq('organization_id', organizationId).eq('slug', 'lead_source'),
    supabase
      .from('records')
      .select('id, title, board_id, group_id, created_at, value, owner_user_id, assigned_user_id, created_by')
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('status', 'active')
      .is('parent_record_id', null)
      .order('created_at', { ascending: false })
      .limit(MAX_RECORDS),
    supabase
      .from('fields')
      .select('id, board_id, slug, name, field_type, common_field_key_id, is_default_status')
      .eq('organization_id', organizationId)
      .eq('field_type', 'currency'),
  ])

  const boards = (boardsRes.data ?? []) as { id: string; name: string }[]
  const boardName = new Map(boards.map((b) => [b.id, b.name]))
  const groups = (groupsRes.data ?? []) as { id: string; board_id: string; name: string }[]
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const lsFields = (lsFieldsRes.data ?? []) as { id: string; board_id: string; config: Record<string, unknown> | null }[]
  const lsFieldIds = lsFields.map((f) => f.id)
  const boardsWithField = new Set(lsFields.map((f) => f.board_id))
  const records = (recordsRes.data ?? []) as RecordRow[]
  const truncated = records.length >= MAX_RECORDS

  // ── Lead-source values (chunked; first non-empty value per record wins —
  // the same resolution order the Verified Results attribution uses). ──
  const sourceOf = new Map<string, string>()
  const recordIds = records.map((r) => r.id)
  if (lsFieldIds.length > 0) {
    for (let i = 0; i < recordIds.length; i += 200) {
      const chunk = recordIds.slice(i, i + 200)
      const { data: fvs } = await supabase
        .from('field_values')
        .select('record_id, value_text')
        .in('field_id', lsFieldIds)
        .in('record_id', chunk)
      for (const fv of (fvs ?? []) as { record_id: string; value_text: string | null }[]) {
        const v = fv.value_text?.trim()
        if (v && !sourceOf.has(fv.record_id)) sourceOf.set(fv.record_id, v)
      }
    }
  }

  // ── Per-record derived facts ──
  const ownerships = new Map(records.map((r) => [r.id, resolveOwnership(r)]))

  // ── 1–2. Summary + per-board coverage ──
  const boardRows: BoardCoverageRow[] = boards.map((b) => {
    const rs = records.filter((r) => r.board_id === b.id)
    const assigned = rs.filter((r) => sourceOf.has(r.id)).length
    const ownerResolved = rs.filter((r) => ownerships.get(r.id)!.resolution !== 'unresolved').length
    return {
      boardId: b.id, boardName: b.name,
      hasField: boardsWithField.has(b.id),
      total: rs.length,
      assigned, unassigned: rs.length - assigned, assignedPct: pct(assigned, rs.length),
      ownerResolved, ownerPct: pct(ownerResolved, rs.length),
      setupMayBeNeeded: !boardsWithField.has(b.id) && rs.length > 0,
    }
  }).sort((a, b) => b.total - a.total)

  const withSource = records.filter((r) => sourceOf.has(r.id)).length
  const ownerResolvedTotal = records.filter((r) => ownerships.get(r.id)!.resolution !== 'unresolved').length

  // ── 3. Value quality (raw values preserved; classification display-only) ──
  const valueCounts = new Map<string, number>()
  for (const r of records) {
    const v = sourceOf.get(r.id)
    if (v) valueCounts.set(v, (valueCounts.get(v) ?? 0) + 1)
  }
  const values: ValueQualityRow[] = [...valueCounts.entries()]
    .map(([raw, count]) => {
      const classification = classifySource(raw)
      const mapped = displaySourceLabel(raw)
      return {
        raw, classification, count,
        canonicalLabel: classification === 'canonical' || classification === 'alias' ? mapped : null,
      }
    })
    .sort((a, b) => b.count - a.count)

  // ── 4. Ownership coverage ──
  const ownCounts = { owner: 0, assigned: 0, createdBy: 0, unresolved: 0 }
  const byOwnerId = new Map<string, number>()
  const unresolvedByBoardMap = new Map<string, number>()
  for (const r of records) {
    const o = ownerships.get(r.id)!
    if (o.resolution === 'owner') ownCounts.owner += 1
    else if (o.resolution === 'assigned') ownCounts.assigned += 1
    else if (o.resolution === 'created_by') ownCounts.createdBy += 1
    else {
      ownCounts.unresolved += 1
      const bn = r.board_id ? (boardName.get(r.board_id) ?? '—') : '—'
      unresolvedByBoardMap.set(bn, (unresolvedByBoardMap.get(bn) ?? 0) + 1)
    }
    if (o.userId) byOwnerId.set(o.userId, (byOwnerId.get(o.userId) ?? 0) + 1)
  }
  // Resolve owner display names via the org-member-visible profiles read.
  let byOwner: { name: string; count: number }[] = []
  const ownerIds = [...byOwnerId.keys()]
  if (ownerIds.length > 0) {
    const { data: profs } = await supabase
      .from('profiles').select('id, first_name, last_name, email').in('id', ownerIds.slice(0, 50))
    const nameOf = new Map(((profs ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null }[])
      .map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.email || p.id.slice(0, 8)]))
    byOwner = [...byOwnerId.entries()]
      .map(([id, count]) => ({ name: nameOf.get(id) ?? id.slice(0, 8), count }))
      .sort((a, b) => b.count - a.count)
  }

  // ── 5. High-value review queue (read-only — no edit actions by design) ──
  const priorityOf = (r: RecordRow): number => {
    const g = r.group_id ? groupById.get(r.group_id) : undefined
    if (g && isClosedGroupName(g.name)) return 1
    const bn = r.board_id ? squash(boardName.get(r.board_id) ?? '') : ''
    if (bn.includes('inprocess')) return 2
    if (bn.includes('preapp')) return 3
    if (bn.includes('initialconsult')) return 4
    return 5
  }
  const candidates = records
    .filter((r) => !sourceOf.has(r.id) || ownerships.get(r.id)!.resolution === 'unresolved')
    .map((r) => ({ r, priority: priorityOf(r) }))
    .sort((a, b) => a.priority - b.priority || b.r.created_at.localeCompare(a.r.created_at))
  const queueLimited = candidates.length > QUEUE_LIMIT
  const queueRecords = candidates.slice(0, QUEUE_LIMIT)

  // Loan amounts for queue rows only (existing resolver; one chunked read).
  const loanFieldIds = new Set<string>()
  {
    const byBoard = new Map<string, NonNullable<typeof currencyFieldsRes.data>>()
    for (const f of currencyFieldsRes.data ?? []) {
      const arr = byBoard.get(f.board_id as string) ?? []
      arr.push(f); byBoard.set(f.board_id as string, arr)
    }
    for (const arr of byBoard.values()) {
      const id = pickLoanAmountFieldId(arr)
      if (id) loanFieldIds.add(id)
    }
  }
  const loanByRecord = new Map<string, number>()
  const queueIds = queueRecords.map((c) => c.r.id)
  if (loanFieldIds.size > 0 && queueIds.length > 0) {
    const { data: fvs } = await supabase
      .from('field_values')
      .select('record_id, field_id, value_number')
      .in('field_id', [...loanFieldIds])
      .in('record_id', queueIds)
    for (const fv of (fvs ?? []) as { record_id: string; field_id: string; value_number: number | null }[]) {
      if (typeof fv.value_number === 'number' && !loanByRecord.has(fv.record_id)) loanByRecord.set(fv.record_id, fv.value_number)
    }
  }

  const queue: ReviewRow[] = queueRecords.map(({ r }) => {
    const raw = sourceOf.get(r.id) ?? null
    const classification = classifySource(raw)
    const o = ownerships.get(r.id)!
    const missingSource = !raw
    const missingOwner = o.resolution === 'unresolved'
    return {
      recordId: r.id,
      title: r.title,
      boardName: r.board_id ? (boardName.get(r.board_id) ?? '—') : '—',
      stage: r.group_id ? (groupById.get(r.group_id)?.name ?? null) : null,
      rawSource: raw,
      classification,
      resolvedCategory: raw ? (classification === 'canonical' || classification === 'alias' ? displaySourceLabel(raw) : null) : null,
      ownerStatus: o.resolution,
      amount: resolveLoanAmount(loanByRecord.get(r.id) ?? null, r.value),
      reason: missingSource && missingOwner ? 'Missing lead source and owner' : missingSource ? 'Missing lead source' : 'Missing owner',
    }
  })

  // ── 6. Ownership by metric population (10E — read-only measurement).
  //       Populations use the app's ONE shared definitions: movement-dated
  //       funded entries into Closing-board funded stages (features/metrics/
  //       funded) and active-status + open-stage pipeline (metrics/shared).
  const now = new Date()
  const MOVEMENTS_CAP = 2000
  const AFFECTED_CAP = 500

  type OwnRecord = {
    id: string; title: string; board_id: string | null; group_id: string | null
    owner_user_id: string | null; assigned_user_id: string | null; created_by: string | null
  }

  // Funded YTD — the funded ids may fall outside the sampled records, so
  // their ownership columns are fetched by id (chunked, bounded).
  const { fundedGroupIds } = detectClosingFundedGroups(boards, groups)
  const fundedRecords: OwnRecord[] = []
  if (fundedGroupIds.size > 0) {
    const { data: mvs } = await supabase
      .from('record_movements')
      .select('record_id, from_group_id, to_group_id, created_at')
      .in('to_group_id', [...fundedGroupIds])
      .gte('created_at', startOfYearOf(now).toISOString())
      .order('created_at', { ascending: false })
      .limit(MOVEMENTS_CAP)
    const entries = entriesIntoSet((mvs ?? []) as MovementRow[], fundedGroupIds)
    const fundedIds = [...distinctEntryIdsInWindow(entries, startOfYearOf(now), new Date(now.getTime() + 86400000))]
    for (let i = 0; i < fundedIds.length; i += 200) {
      const chunk = fundedIds.slice(i, i + 200)
      const { data: recs } = await supabase
        .from('records')
        .select('id, title, board_id, group_id, owner_user_id, assigned_user_id, created_by')
        .in('id', chunk)
      fundedRecords.push(...(((recs ?? []) as OwnRecord[])))
    }
  }

  // Open pipeline + recent leads come from the (possibly sampled) records.
  const groupNameOf = (gid: string | null) => (gid ? (groupById.get(gid)?.name ?? null) : null)
  const pipelineRecords: OwnRecord[] = records.filter((r) => isOpenPipelineRecord('active', groupNameOf(r.group_id)))
  const thirtyDaysAgo = startOfDay(new Date(now.getTime() - 30 * 86400000))
  const recentRecords: OwnRecord[] = records.filter((r) => new Date(r.created_at) >= thirtyDaysAgo)

  const affected: AffectedRecordRow[] = []
  const measure = (key: MetricOwnershipRow['key'], label: string, note: string, rs: OwnRecord[]): MetricOwnershipRow => {
    const counts = { owner: 0, assigned: 0, created_by: 0, unresolved: 0 }
    for (const r of rs) {
      const res = resolveOwnership(r).resolution
      counts[res] += 1
      if ((res === 'created_by' || res === 'unresolved') && affected.length < AFFECTED_CAP) {
        affected.push({
          population: label, recordId: r.id, title: r.title,
          boardName: r.board_id ? (boardName.get(r.board_id) ?? '—') : '—',
          stage: groupNameOf(r.group_id), resolution: res,
        })
      }
    }
    const affectedCount = counts.created_by + counts.unresolved
    return {
      key, label, note,
      total: rs.length,
      owner: counts.owner, assigned: counts.assigned, createdBy: counts.created_by, unresolved: counts.unresolved,
      affected: affectedCount, affectedPct: pct(affectedCount, rs.length),
    }
  }

  const metricOwnership: MetricOwnership = {
    rows: [
      measure('funded_ytd', 'Funded YTD', 'Movement-dated entries into Closing-board funded stages this year', fundedRecords),
      measure('open_pipeline', 'Open pipeline', `Active records in open stages${truncated ? ' (sampled)' : ''}`, pipelineRecords),
      measure('recent_leads', 'Created last 30 days', `Records created in the last 30 days${truncated ? ' (sampled)' : ''}`, recentRecords),
    ],
    affected,
    affectedLimited: affected.length >= AFFECTED_CAP,
  }

  // ── 7. Option-list status per lead_source field (10D — read-only view;
  //       refresh/restore are explicit admin actions elsewhere). ──
  const canonicalNorms = new Set(LEAD_SOURCE_LABELS.map((l) => squash(l)))
  const optionLists: OptionListRow[] = lsFields.map((f) => {
    const cfg = f.config ?? {}
    const opts = Array.isArray(cfg.options)
      ? (cfg.options as { label?: unknown }[]).filter((o) => typeof o?.label === 'string').map((o) => String(o.label))
      : []
    const optNorms = new Set(opts.map(squash))
    const missingCanonical = LEAD_SOURCE_LABELS.filter((l) => !optNorms.has(squash(l))).length
    const legacyOptions = opts.filter((l) => !canonicalNorms.has(squash(l))).length
    return {
      fieldId: f.id,
      boardId: f.board_id,
      boardName: boardName.get(f.board_id) ?? '—',
      optionCount: opts.length,
      missingCanonical,
      legacyOptions,
      hasSnapshot: Array.isArray(cfg.previous_options),
      refreshedAt: typeof cfg.options_refreshed_at === 'string' ? cfg.options_refreshed_at : null,
    }
  }).sort((a, b) => b.missingCanonical - a.missingCanonical || a.boardName.localeCompare(b.boardName))

  return {
    summary: {
      totalRecords: records.length, truncated,
      withSource, withoutSource: records.length - withSource, sourcePct: pct(withSource, records.length),
      ownerResolved: ownerResolvedTotal, ownerUnresolved: records.length - ownerResolvedTotal, ownerPct: pct(ownerResolvedTotal, records.length),
      boardsWithField: boards.filter((b) => boardsWithField.has(b.id)).length,
      boardsMissingField: boards.filter((b) => !boardsWithField.has(b.id)).length,
    },
    boards: boardRows,
    values,
    ownership: { ...{ owner: ownCounts.owner, assigned: ownCounts.assigned, createdBy: ownCounts.createdBy, unresolved: ownCounts.unresolved }, byOwner, unresolvedByBoard: [...unresolvedByBoardMap.entries()].map(([boardName, count]) => ({ boardName, count })).sort((a, b) => b.count - a.count) },
    queue,
    queueLimited,
    optionLists,
    metricOwnership,
  }
}
