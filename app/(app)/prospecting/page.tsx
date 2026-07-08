import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildThemeDayData } from '@/features/prospecting/themeday/queues'
import { getProspectingStreak } from '@/features/prospecting/streak'
import { getDailyCallTarget } from '@/features/prospecting/target'
import { buildGreatnessData } from '@/features/prospecting/greatness/queries'
import { GreatnessTracker } from '@/features/prospecting/greatness/GreatnessTracker'
import { TrackView } from '@/features/analytics/TrackView'
import { ThemeDayCockpit } from '@/features/prospecting/themeday/ThemeDayCockpit'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────
// Prospecting Dashboard — the daily theme-day call cockpit (Prospecting
// Redesign reference): navy hero → Mon–Fri week strip → today's list, in a
// centered, width-constrained column on the warm cream background. The
// former dashboard extras (sessions, momentum, pace, contacted-today, the
// scored queue, and the side stats rail) are deferred from this page for
// visual parity with the reference; their modules remain for a future
// secondary view.
// ─────────────────────────────────────────────────────────────────────────

export default async function ProspectingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  const orgId = membership.organization_id

  const [themeData, streak, dailyGoal, greatness] = await Promise.all([
    buildThemeDayData(orgId, user.id),
    getProspectingStreak(orgId, user.id),
    // Daily Call Log goal — session > profile (daily_call_goal) > goal > 10.
    getDailyCallTarget(orgId, user.id),
    // Greatness Tracker (Phase 2) — read-only scoreboard aggregation.
    buildGreatnessData(orgId, user.id),
  ])

  return (
    <div className="h-full overflow-y-auto">
      <TrackView surface="prospecting" />
      <div className="w-full px-4 py-6 sm:px-8 lg:px-10">
        <ThemeDayCockpit
          data={themeData}
          streak={streak}
          organizationId={orgId}
          goal={dailyGoal.target}
          goalSource={dailyGoal.label}
        />
        {/* Greatness Tracker — the Phase 2 scoreboard, below the Daily Call
            Log and independent of the hero/week/list layout above. */}
        <div className="mt-8">
          <GreatnessTracker data={greatness} />
        </div>
      </div>
    </div>
  )
}
