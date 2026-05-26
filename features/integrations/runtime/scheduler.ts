// ─────────────────────────────────────────────────────────────────────────
// Lightweight scheduler runtime.
//
// A small registry of maintenance jobs run from an authenticated context
// (Today-load drain / manual / command). Jobs are idempotent so they're safe to
// run on every tick. Cron-compatible later (each job is a pure (ctx)→summary fn).
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { runWorkflowScans } from '@/features/workflows/triggers/scan'
import type { SystemExecutionContext } from './context'

export type JobResult = { key: string; ran: boolean; detail?: string }

const PREAPPROVAL_WINDOW_DAYS = 14

function todayISO() { return new Date().toISOString().slice(0, 10) }
function inDaysISO(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString() }

/**
 * Preapproval-expiration automation: for records whose "Preapproval Expiration"
 * date falls within the next 14 days, create an attention daily-action + a task.
 * Fully idempotent (dedupes by title), so safe to run repeatedly.
 */
export async function runPreapprovalScan(supabase: SupabaseClient, ctx: SystemExecutionContext): Promise<JobResult> {
  // Find the org's preapproval-expiration date fields.
  const { data: fields } = await supabase
    .from('fields')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('slug', 'preapproval_expiration')
  if (!fields || fields.length === 0) return { key: 'preapproval_expiration', ran: false, detail: 'no field' }

  const fieldIds = fields.map((f) => f.id)
  const { data: rows } = await supabase
    .from('field_values')
    .select('record_id, value_date, records!inner(id, title, organization_id, is_archived)')
    .in('field_id', fieldIds)
    .gte('value_date', new Date().toISOString())
    .lte('value_date', inDaysISO(PREAPPROVAL_WINDOW_DAYS))

  let created = 0
  for (const row of rows ?? []) {
    const rec = (row as unknown as { records: { id: string; title: string; is_archived: boolean } }).records
    if (!rec || rec.is_archived) continue
    const when = row.value_date ? new Date(row.value_date).toLocaleDateString() : 'soon'
    const title = `Preapproval expiring ${when} — ${rec.title}`

    // Daily action (dedupe by user+date+title).
    const { data: existingDA } = await supabase
      .from('daily_actions').select('id').eq('user_id', ctx.userId).eq('due_date', todayISO()).eq('title', title).limit(1)
    if ((!existingDA || existingDA.length === 0) && ctx.userId) {
      await supabase.rpc('create_daily_action', {
        p_organization_id: ctx.organizationId, p_title: title, p_description: null,
        p_priority: 'high', p_due_date: todayISO(), p_action_type: 'attention',
        p_source: 'workflow', p_production_goal_id: null, p_record_id: rec.id, p_task_id: null,
        p_user_id: ctx.userId,
      }).then(() => { created++ }, () => {})
    }

    // Task (dedupe by open task title on the record).
    const { data: existingTask } = await supabase
      .from('tasks').select('id').eq('record_id', rec.id).eq('title', title).is('completed_at', null).limit(1)
    if (!existingTask || existingTask.length === 0) {
      await supabase.from('tasks').insert({
        organization_id: ctx.organizationId, record_id: rec.id, title,
        priority: 'high', created_by: ctx.userId, assigned_user_id: ctx.userId,
      }).then(() => {}, () => {})
    }
  }

  return { key: 'preapproval_expiration', ran: true, detail: `${created} new` }
}

/** Run all due maintenance jobs. Best-effort; one failing job doesn't block others. */
export async function runScheduledJobs(supabase: SupabaseClient, ctx: SystemExecutionContext): Promise<JobResult[]> {
  const results: JobResult[] = []

  // Stale-record + overdue-next-action scans (Phase 14). These dispatch workflows
  // through their own SSR client, so they only execute under an authenticated
  // session; skip in headless (cron) runs where there's no auth.uid().
  if (ctx.actorType === 'user') {
    try {
      const { scanned } = await runWorkflowScans(ctx.organizationId, { throttleMinutes: 30 })
      results.push({ key: 'workflow_scans', ran: true, detail: `${scanned} scanned` })
    } catch {
      results.push({ key: 'workflow_scans', ran: false })
    }
  }

  // Preapproval expiration automation.
  try {
    results.push(await runPreapprovalScan(supabase, ctx))
  } catch {
    results.push({ key: 'preapproval_expiration', ran: false })
  }

  return results
}
