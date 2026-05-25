import { createClient } from '@/lib/supabase/server'
import { dispatchWorkflowEvent } from '../engine/dispatch'

// Scheduled-style scans for triggers that aren't fired by a single user action:
//   no_activity_detected — active records gone quiet
//   next_action_overdue  — records whose next action slipped past due
//
// Both are idempotent: the action executor dedupes daily_actions by
// (user, date, title), so re-running within a day never duplicates.
//
// Bounded by CANDIDATE_LIMIT to keep page-load-triggered scans cheap.

const CANDIDATE_LIMIT = 40

export async function runWorkflowScans(
  organizationId: string,
  opts?: { throttleMinutes?: number },
): Promise<{ scanned: number; throttled?: boolean }> {
  const supabase = await createClient()

  // Only do work if the org actually has these trigger workflows enabled
  const { data: enabled } = await supabase
    .from('workflows')
    .select('trigger_type')
    .eq('organization_id', organizationId)
    .eq('enabled', true)
    .in('trigger_type', ['no_activity_detected', 'next_action_overdue'])

  const triggers = new Set((enabled ?? []).map((w: { trigger_type: string }) => w.trigger_type))
  if (triggers.size === 0) return { scanned: 0 }

  // Throttle: skip if a scan ran recently (keeps /today page loads cheap)
  if (opts?.throttleMinutes) {
    const since = new Date(Date.now() - opts.throttleMinutes * 60_000).toISOString()
    const { data: recent } = await supabase
      .from('workflow_executions')
      .select('id')
      .eq('organization_id', organizationId)
      .in('trigger_type', ['no_activity_detected', 'next_action_overdue'])
      .gte('created_at', since)
      .limit(1)
    if (recent && recent.length > 0) return { scanned: 0, throttled: true }
  }

  let scanned = 0

  if (triggers.has('next_action_overdue')) {
    const { data: overdue } = await supabase
      .from('records')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .not('next_action_due_at', 'is', null)
      .is('next_action_completed_at', null)
      .lt('next_action_due_at', new Date().toISOString())
      .limit(CANDIDATE_LIMIT)
    for (const r of overdue ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await dispatchWorkflowEvent({ type: 'next_action_overdue', organizationId, recordId: r.id })
      scanned += 1
    }
  }

  if (triggers.has('no_activity_detected')) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 7)
    const { data: stale } = await supabase
      .from('records')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('is_archived', false)
      .eq('status', 'active')
      .lt('updated_at', cutoff.toISOString())
      .limit(CANDIDATE_LIMIT)
    for (const r of stale ?? []) {
      // eslint-disable-next-line no-await-in-loop
      await dispatchWorkflowEvent({ type: 'no_activity_detected', organizationId, recordId: r.id })
      scanned += 1
    }
  }

  return { scanned }
}
