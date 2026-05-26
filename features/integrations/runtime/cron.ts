// ─────────────────────────────────────────────────────────────────────────
// Headless cron runtime. Runs with the service-role admin client (no session),
// so it processes work even when nobody is logged in. Shares the SAME worker +
// scheduler core as the authenticated drain — only the client + context differ.
// Each org's run is recorded in worker_runs for observability.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { runIntegrationWorker } from './worker'
import { runScheduledJobs } from './scheduler'
import { buildHeadlessContext } from './context'

export type CronSummary = {
  orgsProcessed: number
  events: number
  created: number
  moved: number
  failed: number
  durationMs: number
}

const MAX_ORGS = 100

export async function runCron(admin: SupabaseClient): Promise<CronSummary> {
  const startedAll = Date.now()
  const summary: CronSummary = { orgsProcessed: 0, events: 0, created: 0, moved: 0, failed: 0, durationMs: 0 }

  // Candidate orgs: those with pending/retrying events, plus recently-active orgs
  // (so scheduled scans + snapshots run where it matters). Bounded.
  const orgIds = new Set<string>()
  const { data: pendingOrgs } = await admin
    .from('integration_events').select('organization_id').in('status', ['pending', 'retrying']).limit(1000)
  for (const r of pendingOrgs ?? []) if (r.organization_id) orgIds.add(r.organization_id)

  const since = new Date(Date.now() - 3 * 86400000).toISOString()
  const { data: activeOrgs } = await admin
    .from('activities').select('organization_id').gte('created_at', since).limit(2000)
  for (const r of activeOrgs ?? []) if (r.organization_id) orgIds.add(r.organization_id)

  for (const orgId of [...orgIds].slice(0, MAX_ORGS)) {
    const started = Date.now()
    let status = 'completed'
    let errorMessage: string | null = null
    let s = { picked: 0, processed: 0, created: 0, moved: 0, failed: 0 }
    try {
      const ctx = await buildHeadlessContext(admin, orgId, 'cron')
      s = await runIntegrationWorker(admin, ctx, { limit: 100 })
      await runScheduledJobs(admin, ctx)
      if (ctx.userId) {
        try {
          const { snapshotDailyProgress } = await import('@/features/daily-actions/progress/snapshots')
          await snapshotDailyProgress({ organizationId: orgId, userId: ctx.userId })
        } catch { /* snapshot best-effort */ }
      }
    } catch (e) {
      status = 'failed'
      errorMessage = e instanceof Error ? e.message : 'cron_error'
    }

    const dur = Date.now() - started
    summary.orgsProcessed++
    summary.events += s.processed
    summary.created += s.created
    summary.moved += s.moved
    summary.failed += s.failed

    await admin.from('worker_runs').insert({
      organization_id: orgId, worker_type: 'cron', status,
      finished_at: new Date().toISOString(), duration_ms: dur, summary: s, error_message: errorMessage,
    })
  }

  summary.durationMs = Date.now() - startedAll
  return summary
}
