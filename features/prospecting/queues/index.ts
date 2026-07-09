// ─────────────────────────────────────────────────────────────────────────
// Call queue builder — batched server query that assembles candidate signals
// from records + communication_logs + key field values, scores them, and
// returns a prioritized, bucketed queue. Org-scoped; no AI.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { scoreCandidate } from '../scoring'
import { getThemeDay } from '../coaching/themeDay'
import { getProspectingSchedule } from '../schedule/queries'
import { dayScheduleFor, type DaySchedule } from '../schedule/types'
import type { CandidateSignal, ScoredLead } from '../types'

const MAX_CANDIDATES = 300
const QUEUE_SIZE = 60

function days(fromIso: string | null): number | null {
  if (!fromIso) return null
  const t = new Date(fromIso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

/**
 * Build the prioritized call queue for an org.
 *
 * When a userId is supplied and that user has an enabled Phase 39A schedule,
 * today's plan decides which board(s) the queue pulls from:
 *   • 'off'    → empty queue
 *   • 'any'    → legacy behavior (score across all boards + theme-day boost)
 *   • 'boards' → filter to the chosen boards; smart scoring still ranks within.
 *               Unless `strict`, the queue backfills from the next-best leads on
 *               other boards up to the day's target so the caller is never idle.
 */
export async function buildCallQueue(
  organizationId: string,
  opts: { userId?: string } = {},
): Promise<ScoredLead[]> {
  const supabase = await createClient()

  // Resolve today's schedule (if we know the caller). No schedule / disabled →
  // daySched stays null and the queue behaves exactly as before.
  let daySched: DaySchedule | null = null
  let strict = false
  if (opts.userId) {
    const { schedule } = await getProspectingSchedule(organizationId, opts.userId)
    if (schedule.enabled) {
      daySched = dayScheduleFor(schedule, new Date())
      strict = schedule.strict
    }
  }
  if (daySched?.mode === 'off') return []

  // 1. Candidate records (active, not archived) — newest activity first.
  const { data: records } = await supabase
    .from('records')
    .select('id, title, board_id, group_id, value, priority, record_type, next_action, next_action_due_at, next_action_completed_at, updated_at')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(MAX_CANDIDATES)
  if (!records || records.length === 0) return []

  const recordIds = records.map((r) => r.id)
  const boardIds = [...new Set(records.map((r) => r.board_id).filter(Boolean))] as string[]

  // 2. Batched lookups: boards, groups, last contact, key field values.
  const [boardsRes, groupsRes, commRes, fieldsRes] = await Promise.all([
    supabase.from('boards').select('id, slug, board_type').in('id', boardIds),
    supabase.from('board_groups').select('id, name').in('board_id', boardIds),
    supabase.from('communication_logs').select('record_id, occurred_at, channel').in('record_id', recordIds).neq('channel', 'internal').order('occurred_at', { ascending: false }),
    supabase.from('fields').select('id, slug, board_id, field_type').in('board_id', boardIds).or('slug.in.(preapproval_expiration,loan_amount),field_type.eq.phone'),
  ])

  const boardBySlug = new Map((boardsRes.data ?? []).map((b) => [b.id, b]))
  const groupName = new Map((groupsRes.data ?? []).map((g) => [g.id, g.name]))

  // last contact per record (first seen wins, list is desc).
  const lastContact = new Map<string, string>()
  for (const c of commRes.data ?? []) if (!lastContact.has(c.record_id)) lastContact.set(c.record_id, c.occurred_at)

  // field value lookups (preapproval_expiration date, loan_amount number).
  const preapprovalFieldIds = new Set((fieldsRes.data ?? []).filter((f) => f.slug === 'preapproval_expiration').map((f) => f.id))
  const loanAmountFieldIds = new Set((fieldsRes.data ?? []).filter((f) => f.slug === 'loan_amount').map((f) => f.id))
  const phoneFieldIds = new Set((fieldsRes.data ?? []).filter((f) => f.field_type === 'phone').map((f) => f.id))
  const allFieldIds = [...preapprovalFieldIds, ...loanAmountFieldIds, ...phoneFieldIds]
  const preapprovalByRecord = new Map<string, string>()
  const loanAmountByRecord = new Map<string, number>()
  const phoneByRecord = new Map<string, string>()
  if (allFieldIds.length > 0) {
    const { data: fvs } = await supabase
      .from('field_values').select('record_id, field_id, value_date, value_number, value_text').in('field_id', allFieldIds).in('record_id', recordIds)
    for (const fv of fvs ?? []) {
      if (preapprovalFieldIds.has(fv.field_id) && fv.value_date) preapprovalByRecord.set(fv.record_id, fv.value_date)
      if (loanAmountFieldIds.has(fv.field_id) && fv.value_number != null) loanAmountByRecord.set(fv.record_id, fv.value_number)
      if (phoneFieldIds.has(fv.field_id) && fv.value_text) phoneByRecord.set(fv.record_id, fv.value_text)
    }
  }

  // The old theme-day boost only applies when the day isn't pinned to specific
  // boards — an explicit board schedule replaces (not stacks with) that nudge.
  const themeBoardSlug = daySched?.mode === 'boards' ? null : getThemeDay().boardSlug

  // 3. Assemble signals + score.
  const scored: ScoredLead[] = records.map((r) => {
    const board = r.board_id ? boardBySlug.get(r.board_id) : undefined
    const lc = lastContact.get(r.id) ?? null
    const preExp = preapprovalByRecord.get(r.id) ?? null
    const sig: CandidateSignal = {
      recordId: r.id, title: r.title, boardId: r.board_id, boardSlug: board?.slug ?? null,
      recordType: r.record_type, groupName: r.group_id ? (groupName.get(r.group_id) ?? null) : null,
      value: r.value, priority: r.priority, nextAction: r.next_action,
      nextActionDueAt: r.next_action_due_at, nextActionCompletedAt: r.next_action_completed_at,
      updatedAt: r.updated_at, lastContactedAt: lc, daysSinceContact: days(lc),
      preapprovalExpDays: preExp ? Math.ceil((new Date(preExp).getTime() - Date.now()) / 86400000) : null,
      loanAmount: loanAmountByRecord.get(r.id) ?? r.value ?? null,
      phone: phoneByRecord.get(r.id) ?? null,
    }
    return scoreCandidate(sig, { themeBoardSlug })
  })

  // 4. Only surface records that actually warrant a call (score > 0), ranked.
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)

  // No board pinning today → legacy top-N across everything.
  if (!daySched || daySched.mode !== 'boards' || daySched.boardIds.length === 0) {
    return ranked.slice(0, QUEUE_SIZE)
  }

  // Board-pinned day: scheduled boards first (still ranked by score within).
  const scheduled = new Set(daySched.boardIds)
  const primary = ranked.filter((s) => s.boardId && scheduled.has(s.boardId))
  if (strict) return primary.slice(0, QUEUE_SIZE)

  // Backfill: if the scheduled pool is thinner than the day's target, top it up
  // with the next-best leads from other boards so the caller always has a queue.
  const floor = daySched.target && daySched.target > 0 ? daySched.target : 0
  if (primary.length >= floor) return primary.slice(0, QUEUE_SIZE)
  const backfill = ranked
    .filter((s) => !(s.boardId && scheduled.has(s.boardId)))
    .slice(0, floor - primary.length)
    .map((s) => ({ ...s, backfill: true }))
  return [...primary, ...backfill].slice(0, QUEUE_SIZE)
}
