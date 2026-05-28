import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildCallQueue } from '@/features/prospecting/queues'
import { getActiveSession, getLiveSessionStats, getRecentSessions } from '@/features/prospecting/sessions/queries'
import { getProspectingMetrics } from '@/features/prospecting/metrics'
import { getDailyCallTarget } from '@/features/prospecting/target'
import { getThemeDay } from '@/features/prospecting/coaching/themeDay'
import { buildProspectingCoaching } from '@/features/prospecting/coaching'
import { getFollowUpsDueCount } from '@/features/communications/queries'
import { ProspectingCockpit } from '@/features/prospecting/cockpit/ProspectingCockpit'

export const dynamic = 'force-dynamic'

export default async function ProspectingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  const orgId = membership.organization_id

  const [queue, session, metrics, followUpsDue, sessions] = await Promise.all([
    buildCallQueue(orgId),
    getActiveSession(orgId, user.id),
    getProspectingMetrics(orgId, user.id),
    getFollowUpsDueCount(orgId),
    getRecentSessions(orgId, user.id),
  ])
  const liveStats = session ? await getLiveSessionStats(session) : null
  const themeDay = getThemeDay()
  const callTarget = await getDailyCallTarget(orgId, user.id, session)
  const coaching = buildProspectingCoaching({ metrics, callGoal: callTarget.target, themeDay, queueSize: queue.length, followUpsDue })

  return (
    <ProspectingCockpit
      organizationId={orgId}
      queue={queue}
      metrics={metrics}
      session={session}
      liveStats={liveStats}
      themeDay={themeDay}
      coaching={coaching}
      callGoal={callTarget.target}
      targetLabel={callTarget.label}
      followUpsDue={followUpsDue}
      sessions={sessions}
    />
  )
}
