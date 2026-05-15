import { createClient } from '@/lib/supabase/server'
import type { DashboardRow, DashboardWidgetRow, SavedViewRow } from '@/features/widgets/types'

export async function getDashboards(organizationId: string): Promise<DashboardRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('dashboards')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
  return (data ?? []) as DashboardRow[]
}

export async function getDashboard(dashboardId: string): Promise<DashboardRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('dashboards')
    .select('*')
    .eq('id', dashboardId)
    .single()
  return data as DashboardRow | null
}

export async function getDashboardWidgets(dashboardId: string): Promise<DashboardWidgetRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('dashboard_widgets')
    .select('*')
    .eq('dashboard_id', dashboardId)
    .order('position_y', { ascending: true })
    .order('position_x', { ascending: true })
  return (data ?? []) as DashboardWidgetRow[]
}

export async function getSavedViews(organizationId: string): Promise<SavedViewRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('saved_views')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
  return (data ?? []) as SavedViewRow[]
}
