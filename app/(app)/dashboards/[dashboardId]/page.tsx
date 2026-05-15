import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboard, getDashboardWidgets, getSavedViews } from '@/features/dashboards/queries'
import { getDashboardWidgetData } from '@/features/widgets/queries'
import { getBoards } from '@/features/boards/queries'
import { DashboardClient } from '@/features/dashboards/components/DashboardClient'

interface PageProps {
  params: Promise<{ dashboardId: string }>
}

export default async function DashboardDetailPage({ params }: PageProps) {
  const { dashboardId } = await params

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

  const [dashboard, widgets, boards, savedViews] = await Promise.all([
    getDashboard(dashboardId),
    getDashboardWidgets(dashboardId),
    getBoards(orgId),
    getSavedViews(orgId),
  ])

  if (!dashboard || dashboard.organization_id !== orgId) notFound()
  if (dashboard.is_archived) redirect('/dashboard')

  const widgetData = await getDashboardWidgetData(widgets, orgId)

  return (
    <DashboardClient
      dashboard={dashboard}
      widgets={widgets}
      widgetData={widgetData}
      boards={boards.map(b => ({ id: b.id, name: b.name }))}
      savedViews={savedViews}
      organizationId={orgId}
    />
  )
}
