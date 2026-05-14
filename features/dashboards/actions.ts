'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { WidgetType } from '@/types/database'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export async function createDashboard(data: {
  organization_id: string
  name: string
  description?: string
  icon?: string
  color?: string
  is_default?: boolean
}): Promise<string> {
  const supabase = await createClient()

  const slug = toSlug(data.name) || 'dashboard'

  // Use a SECURITY DEFINER RPC — same pattern as create_organization_with_owner.
  // Direct insert fails because auth.uid() evaluates to NULL in the RLS WITH CHECK
  // context for server actions, causing is_org_member() to return FALSE.
  const { data: dashboardId, error } = await supabase.rpc('create_dashboard_for_member', {
    p_organization_id: data.organization_id,
    p_name:            data.name,
    p_slug:            slug,
    p_description:     data.description ?? null,
    p_icon:            data.icon ?? null,
    p_color:           data.color ?? null,
    p_is_default:      data.is_default ?? false,
  })

  if (error) throw new Error(error.message)
  if (!dashboardId) throw new Error('Failed to create dashboard')

  revalidatePath('/dashboard')
  return dashboardId as string
}

export async function updateDashboard(dashboardId: string, updates: {
  name?: string
  description?: string
  icon?: string
  color?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('dashboards')
    .update(updates)
    .eq('id', dashboardId)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboards/${dashboardId}`)
  revalidatePath('/dashboard')
}

export async function deleteDashboard(dashboardId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('dashboards')
    .delete()
    .eq('id', dashboardId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard')
}

export async function addWidget(data: {
  dashboard_id: string
  widget_type: WidgetType
  title: string
  width: number
  height?: number
  position_x?: number
  position_y?: number
  config: Record<string, unknown>
}): Promise<string> {
  const supabase = await createClient()

  // Place at end: find max position_y for this dashboard
  const { data: existing } = await supabase
    .from('dashboard_widgets')
    .select('position_y')
    .eq('dashboard_id', data.dashboard_id)
    .order('position_y', { ascending: false })
    .limit(1)

  const nextY = existing && existing.length > 0 ? (existing[0].position_y + 1) : 0

  const { data: row, error } = await supabase
    .from('dashboard_widgets')
    .insert({
      dashboard_id: data.dashboard_id,
      widget_type: data.widget_type,
      title: data.title,
      width: data.width,
      height: data.height ?? 1,
      position_x: data.position_x ?? 0,
      position_y: data.position_y ?? nextY,
      config: data.config,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  revalidatePath(`/dashboards/${data.dashboard_id}`)
  revalidatePath('/dashboard')
  return row.id
}

export async function updateWidget(widgetId: string, dashboardId: string, updates: {
  title?: string
  width?: number
  config?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('dashboard_widgets')
    .update(updates)
    .eq('id', widgetId)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboards/${dashboardId}`)
  revalidatePath('/dashboard')
}

export async function removeWidget(widgetId: string, dashboardId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('dashboard_widgets')
    .delete()
    .eq('id', widgetId)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboards/${dashboardId}`)
  revalidatePath('/dashboard')
}
