import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOnboardingProfile } from '@/features/onboarding/queries'
import { assumptionsFromAnswers } from '@/features/production-plan/calc'
import { ProductionPlanClient } from '@/features/production-plan/ProductionPlanClient'
import { buildGreatnessData } from '@/features/prospecting/greatness/queries'
import { getDailyCallTarget } from '@/features/prospecting/target'
import { TrackView } from '@/features/analytics/TrackView'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────
// Production Plan (Phase 3) — Business Plan Math. Editable assumptions live
// in onboarding_profiles.answers (production_plan_* keys — the canonical
// planning-assumption source); the math is the pure module in
// features/production-plan/calc; Plan-vs-Actual reuses the Greatness
// Tracker aggregation so metric definitions never fork. The legacy
// /business-plan coaching page (production_goals-driven) is intentionally
// untouched until a later consolidation phase.
// ─────────────────────────────────────────────────────────────────────────

export default async function ProductionPlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  const orgId = membership.organization_id

  const [profile, greatness, dailyGoal] = await Promise.all([
    getOnboardingProfile(orgId),
    buildGreatnessData(orgId, user.id),
    getDailyCallTarget(orgId, user.id),
  ])

  const initial = assumptionsFromAnswers((profile?.answers ?? {}) as Record<string, unknown>)

  return (
    <div className="h-full overflow-y-auto">
      <TrackView surface="production-plan" />
      <div className="w-full px-4 py-6 sm:px-8 lg:px-10">
        <ProductionPlanClient
          organizationId={orgId}
          initial={initial}
          greatness={greatness}
          dailyCallGoal={dailyGoal.target}
          dailyCallGoalLabel={dailyGoal.label}
        />
      </div>
    </div>
  )
}
