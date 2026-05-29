// ─────────────────────────────────────────────────────────────────────────
// Analytics aggregation for the admin dashboard. Admin-only via RLS (only org
// admins can SELECT analytics_events). Aggregates a 30-day window in memory —
// fine at v1 volume; swap for SQL rollups when data grows.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'

export type AnalyticsSummary = {
  totalEvents: number
  activeUsers7d: number
  activeUsers30d: number
  byEvent: { event: string; count: number }[]
  bySurface: { surface: string; count: number }[]
  onboardingCompletions: number
  feedbackSubmitted: number
}

export type FeedbackRow = {
  id: string
  feedback_type: string
  title: string
  description: string | null
  status: string
  created_at: string
}

export async function getAnalyticsSummary(organizationId: string): Promise<AnalyticsSummary> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data } = await supabase
    .from('analytics_events')
    .select('event_name, user_id, props, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10000)

  const rows = (data as Array<{ event_name: string; user_id: string; props: Record<string, unknown>; created_at: string }> | null) ?? []
  const sevenAgo = Date.now() - 7 * 86400000
  const u7 = new Set<string>()
  const u30 = new Set<string>()
  const byEvent = new Map<string, number>()
  const bySurface = new Map<string, number>()

  for (const r of rows) {
    u30.add(r.user_id)
    if (new Date(r.created_at).getTime() >= sevenAgo) u7.add(r.user_id)
    byEvent.set(r.event_name, (byEvent.get(r.event_name) ?? 0) + 1)
    if (r.event_name === 'page_view') {
      const s = (r.props?.surface as string) ?? 'unknown'
      bySurface.set(s, (bySurface.get(s) ?? 0) + 1)
    }
  }

  return {
    totalEvents: rows.length,
    activeUsers7d: u7.size,
    activeUsers30d: u30.size,
    byEvent: [...byEvent.entries()].map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count),
    bySurface: [...bySurface.entries()].map(([surface, count]) => ({ surface, count })).sort((a, b) => b.count - a.count),
    onboardingCompletions: byEvent.get('onboarding_completed') ?? 0,
    feedbackSubmitted: byEvent.get('feedback_submitted') ?? 0,
  }
}

export async function getFeedback(organizationId: string): Promise<FeedbackRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('feedback_submissions')
    .select('id, feedback_type, title, description, status, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(100)
  return (data as FeedbackRow[] | null) ?? []
}
