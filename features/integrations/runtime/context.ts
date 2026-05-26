// ─────────────────────────────────────────────────────────────────────────
// SystemExecutionContext — the trusted server-side context the runtime worker
// and scheduler act under. Two flavors share one shape:
//
//  • authenticated member drain  → actorType 'user',  client = SSR session
//  • headless cron               → actorType 'system', client = service-role admin
//
// `userId` is the user that OWNS generated user-scoped rows (daily actions,
// task assignment). For headless runs it resolves to the org owner; activities
// are still tagged actorType 'system' so the audit trail shows machine origin.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export type ExecutionSource = 'integration' | 'scheduler' | 'manual' | 'cron'

export type SystemExecutionContext = {
  organizationId: string
  userId: string | null
  actorType: 'user' | 'system'
  source: ExecutionSource
}

/** Build a headless context for an org by resolving its owner as the acting user. */
export async function buildHeadlessContext(
  admin: SupabaseClient,
  organizationId: string,
  source: ExecutionSource = 'cron',
): Promise<SystemExecutionContext> {
  const { data: org } = await admin
    .from('organizations')
    .select('owner_user_id')
    .eq('id', organizationId)
    .maybeSingle()
  return {
    organizationId,
    userId: org?.owner_user_id ?? null,
    actorType: 'system',
    source,
  }
}
