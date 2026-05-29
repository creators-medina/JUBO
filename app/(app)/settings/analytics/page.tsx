import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAnalyticsSummary, getFeedback } from '@/features/analytics/queries'
import { AnalyticsSettingsClient } from '@/features/analytics/AnalyticsSettingsClient'

export const dynamic = 'force-dynamic'

export default async function AnalyticsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  // Admin-only — non-admins bounce to Today.
  if (!['owner', 'admin'].includes((membership as { role: string }).role)) redirect('/today')

  const orgId = membership.organization_id
  const [summary, feedback] = await Promise.all([getAnalyticsSummary(orgId), getFeedback(orgId)])
  return <AnalyticsSettingsClient summary={summary} feedback={feedback} />
}
