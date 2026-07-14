// ─────────────────────────────────────────────────────────────────────────
// Phase 23 — Prospecting widget data fetchers. User+org scoped; called from the
// dashboard's bulk widget fetch (which runs in an authenticated session).
// ─────────────────────────────────────────────────────────────────────────

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getProspectingMetrics } from '../metrics'
import { getActiveSession, getLiveSessionStats } from '../sessions/queries'
import { getDailyCallTarget } from '../target'
import { buildCallQueue } from '../queues'
import { getFollowUpsDue } from '@/features/communications/queries'
import type {
  ProspectingSummaryData, ConnectionRateData, HotLeadsData,
  FollowupsDueData, ActiveCallSessionData, HotLeadsWidgetConfig, FollowupsDueWidgetConfig,
} from './types'

/**
 * Resolve the calling user, but only if they belong to the dashboard's org.
 * cache()d so the dashboard's several prospecting widgets share ONE auth +
 * membership lookup per request instead of one each.
 */
const currentUser = cache(async (orgId: string): Promise<string | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .limit(1)
    .maybeSingle()
  return membership ? user.id : null
})

export async function getProspectingSummaryData(orgId: string): Promise<ProspectingSummaryData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const [metrics, session] = await Promise.all([
    getProspectingMetrics(orgId, userId),
    getActiveSession(orgId, userId),
  ])
  const { target, label } = await getDailyCallTarget(orgId, userId, session)
  return {
    callsToday: metrics.callsToday,
    connectsToday: metrics.connectsToday,
    connectionRate: metrics.connectionRate,
    meetingsBookedToday: metrics.meetingsBookedToday,
    remaining: Math.max(0, target - metrics.callsToday),
    target,
    targetLabel: label,
    sessionActive: !!session,
  }
}

export async function getConnectionRateData(orgId: string): Promise<ConnectionRateData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const m = await getProspectingMetrics(orgId, userId)
  return {
    todayRate: m.connectionRate,
    weekRate: m.connectionRateWeek,
    todayCalls: m.callsToday,
    weekCalls: m.callsThisWeek,
    todayConnects: m.connectsToday,
    weekConnects: m.connectsThisWeek,
    trend: m.connectionRate - m.connectionRateWeek,
  }
}

export async function getHotLeadsData(config: HotLeadsWidgetConfig, orgId: string): Promise<HotLeadsData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const queue = await buildCallQueue(orgId)
  const max = config.max_items ?? 5
  const leads = queue
    .filter((l) => l.temperature === 'hot' || l.temperature === 'warm')
    .slice(0, max)
    .map((l) => ({
      recordId: l.recordId,
      title: l.title,
      boardId: l.boardId,
      temperature: l.temperature,
      reason: l.reasons[0] ?? null,
      daysSinceContact: l.daysSinceContact,
      nextActionDueAt: l.nextActionDueAt,
    }))
  return { leads }
}

export async function getFollowupsDueData(config: FollowupsDueWidgetConfig, orgId: string): Promise<FollowupsDueData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const items = await getFollowUpsDue(orgId, config.max_items ?? 6)
  return { items, total: items.length }
}

export async function getActiveCallSessionData(orgId: string): Promise<ActiveCallSessionData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const session = await getActiveSession(orgId, userId)
  if (!session) {
    const { target } = await getDailyCallTarget(orgId, userId, null)
    return { active: false, organizationId: orgId, sessionId: null, startedAt: null, attempted: 0, connected: 0, meetings: 0, target }
  }
  const stats = await getLiveSessionStats(session)
  const { target } = await getDailyCallTarget(orgId, userId, session)
  return {
    active: true,
    organizationId: orgId,
    sessionId: session.id,
    startedAt: session.started_at,
    attempted: stats.attempted,
    connected: stats.connected,
    meetings: stats.meetings,
    target,
  }
}
