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

  // SECURITY DEFINER RPC — direct insert fails because auth.uid() evaluates to
  // NULL in the RLS WITH CHECK context for server actions.
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
  is_default?: boolean
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

export async function archiveDashboard(dashboardId: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('archive_dashboard', {
    p_dashboard_id: dashboardId,
  })
  if (error) throw new Error(error.message)
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
  config: Record<string, unknown>
}): Promise<string> {
  const supabase = await createClient()

  // SECURITY DEFINER RPC handles auto-position and RLS
  const { data: widgetId, error } = await supabase.rpc('add_dashboard_widget', {
    p_dashboard_id: data.dashboard_id,
    p_widget_type:  data.widget_type,
    p_title:        data.title,
    p_width:        data.width,
    p_height:       data.height ?? 1,
    p_config:       data.config,
  })

  if (error) throw new Error(error.message)
  if (!widgetId) throw new Error('Failed to add widget')

  revalidatePath(`/dashboards/${data.dashboard_id}`)
  revalidatePath('/dashboard')
  return widgetId as string
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

export async function reorderWidgets(
  positions: { id: string; position_y: number }[],
  dashboardId: string,
) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('reorder_dashboard_widgets', {
    p_positions: positions,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboards/${dashboardId}`)
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
