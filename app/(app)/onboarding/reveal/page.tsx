import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOnboardingProfile } from '@/features/onboarding/queries'
import { getCoachingSnapshot } from '@/features/coaching/queries'
import { PlanRevealClient } from '@/features/onboarding/components/PlanRevealClient'
import type { PlanSummary } from '@/features/coaching/components/PlanExplanationCard'

export const dynamic = 'force-dynamic'

// ── Provisioned-truth queries ───────────────────────────────────────────────
// Section 3 ("What Jubo Created") must reflect THIS org's real rows, not the
// template list. All queries scoped to organization_id.

type RevealQueries = {
  boards: { id: string; name: string; board_type: string | null; icon: string | null; color: string | null; recordCount: number }[]
  dashboards: { id: string; name: string; description: string | null; is_default: boolean | null }[]
  funnelName: string | null
  enabledWorkflows: { title: string; trigger_type: string | null }[]
  integrationsInterested: { provider: string; status: string }[]
  uploadsCount: number
  // Phase 30B — uploads queued for manual review (low autoMap confidence).
  uploadsNeedingReview: { kind: string; file_name: string }[]
  uploadsFailed: { kind: string; file_name: string }[]
}

async function loadRevealData(orgId: string): Promise<RevealQueries> {
  const supabase = await createClient()

  const [boardsQ, dashboardsQ, funnelsQ, workflowsQ, prefsQ, uploadsQ, needsReviewQ, failedQ] = await Promise.all([
    supabase.from('boards')
      .select('id, name, board_type, icon, color')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .order('position', { ascending: true }),
    supabase.from('dashboards')
      .select('id, name, description, is_default')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: true }),
    supabase.from('funnels')
      .select('name')
      .eq('organization_id', orgId)
      .eq('is_archived', false)
      .limit(1)
      .maybeSingle(),
    supabase.from('workflows')
      .select('title, trigger_type')
      .eq('organization_id', orgId)
      .eq('enabled', true)
      .order('title', { ascending: true }),
    supabase.from('integration_preferences')
      .select('provider, status')
      .eq('organization_id', orgId)
      .in('status', ['interested', 'connect_later', 'connected']),
    supabase.from('onboarding_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    supabase.from('onboarding_uploads')
      .select('kind, file_name')
      .eq('organization_id', orgId)
      .eq('status', 'needs_review'),
    supabase.from('onboarding_uploads')
      .select('kind, file_name')
      .eq('organization_id', orgId)
      .eq('status', 'failed'),
  ])

  // Per-board record counts (Phase 30B — show populated boards in Section 5).
  const boardIds = (boardsQ.data ?? []).map((b) => b.id)
  const countByBoard = new Map<string, number>()
  if (boardIds.length > 0) {
    // Run counts in parallel — Supabase's head-count query is cheap.
    const counts = await Promise.all(
      boardIds.map(async (id) => {
        const { count } = await supabase
          .from('records')
          .select('id', { count: 'exact', head: true })
          .eq('board_id', id)
          .eq('is_archived', false)
          .is('parent_record_id', null)
        return { id, count: count ?? 0 }
      }),
    )
    for (const c of counts) countByBoard.set(c.id, c.count)
  }

  return {
    boards: (boardsQ.data ?? []).map((b) => ({ ...b, recordCount: countByBoard.get(b.id) ?? 0 })),
    dashboards: dashboardsQ.data ?? [],
    funnelName: (funnelsQ.data as { name: string } | null)?.name ?? null,
    enabledWorkflows: workflowsQ.data ?? [],
    integrationsInterested: prefsQ.data ?? [],
    uploadsCount: uploadsQ.count ?? 0,
    uploadsNeedingReview: needsReviewQ.data ?? [],
    uploadsFailed: failedQ.data ?? [],
  }
}

export default async function PlanRevealPage({
  searchParams,
}: {
  searchParams: Promise<{ replay?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const params = await searchParams
  const isReplay = params.replay === '1'

  const profile = await getOnboardingProfile(orgId)
  // Only show the reveal post-completion; pre-completion users belong in the wizard.
  if (!profile || profile.status !== 'completed') {
    redirect('/onboarding/setup')
  }
  // Already revealed and not explicitly replaying → don't re-show automatically.
  if (profile.plan_revealed_at && !isReplay) {
    redirect('/today')
  }

  const [snap, data] = await Promise.all([
    getCoachingSnapshot(orgId, user.id),
    loadRevealData(orgId),
  ])

  const planSummary: PlanSummary | null = snap.plan
    ? {
        incomeGoal: snap.plan.incomeGoal,
        dailyConversations: snap.plan.dailyConversations,
        weeklyConversations: snap.plan.weeklyConversations,
        partnersNeeded: snap.plan.partnersNeeded,
        closingTarget: snap.plan.closingTarget,
        notes: snap.plan.notes,
        executionScore: snap.execution.overall,
        talkTosToday: snap.talkTosToday,
      }
    : null

  return (
    <PlanRevealClient
      organizationId={orgId}
      isReplay={isReplay}
      plan={planSummary}
      planLeadsTarget={snap.plan ? Math.ceil(snap.plan.leadsTarget) : 0}
      weeklyLeads={snap.plan ? snap.plan.weeklyLeads : 0}
      yearlyConversations={snap.plan ? snap.plan.yearlyConversations : 0}
      baselineAvgCommission={snap.baselines.avgCommission}
      data={data}
    />
  )
}
