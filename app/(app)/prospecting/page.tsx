import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildCallQueue } from '@/features/prospecting/queues'
import { getActiveSession, getLiveSessionStats, getRecentSessions } from '@/features/prospecting/sessions/queries'
import { getProspectingMetrics } from '@/features/prospecting/metrics'
import { getCallTargets } from '@/features/prospecting/target'
import { getProspectingStreak } from '@/features/prospecting/streak'
import { getContactedToday } from '@/features/prospecting/contacted'
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

  const [queue, session, metrics, followUpsDue, sessions, streak, contactedToday, boardsRes] = await Promise.all([
    buildCallQueue(orgId),
    getActiveSession(orgId, user.id),
    getProspectingMetrics(orgId, user.id),
    getFollowUpsDueCount(orgId),
    getRecentSessions(orgId, user.id),
    getProspectingStreak(orgId, user.id),
    getContactedToday(orgId, user.id),
    // Read-only board list — powers the theme-day "Add more…" links only.
    supabase.from('boards').select('id, name, slug').eq('organization_id', orgId).eq('is_archived', false),
  ])
  const liveStats = session ? await getLiveSessionStats(session) : null
  const themeDay = getThemeDay()
  const targets = await getCallTargets(orgId, user.id, session)
  const coaching = buildProspectingCoaching({ metrics, callGoal: targets.daily, themeDay, queueSize: queue.length, followUpsDue })

  return (
    <ProspectingCockpit
      organizationId={orgId}
      queue={queue}
      metrics={metrics}
      session={session}
      liveStats={liveStats}
      themeDay={themeDay}
      coaching={coaching}
      callGoal={targets.daily}
      targetLabel={targets.label}
      targets={targets}
      streak={streak}
      contactedToday={contactedToday}
      followUpsDue={followUpsDue}
      sessions={sessions}
      boards={(boardsRes.data ?? []) as { id: string; name: string; slug: string | null }[]}
    />
  )
}
