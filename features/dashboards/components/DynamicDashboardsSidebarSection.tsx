'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { cn } from '@/lib/utils'

interface DashboardItem {
  id: string
  name: string
  icon: string | null
}

export function DynamicDashboardsSidebarSection({
  collapsed,
  onCreateClick,
  hideHeader = false,
  filter = '',
}: {
  collapsed: boolean
  onCreateClick?: () => void
  /** Suppress the built-in "Dashboards" header (the shell renders its own). */
  hideHeader?: boolean
  /** Case-insensitive name filter from the sidebar jump box. */
  filter?: string
}) {
  const { currentOrganization } = useOrganization()
  const pathname = usePathname()
  const [dashboards, setDashboards] = useState<DashboardItem[]>([])

  useEffect(() => {
    if (!currentOrganization) return
    const supabase = createClient()
    supabase
      .from('dashboards')
      .select('id, name, icon')
      .eq('organization_id', currentOrganization.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .then(({ data }) => setDashboards((data ?? []) as DashboardItem[]))
  }, [currentOrganization])

  if (dashboards.length === 0 && collapsed) return null

  const q = filter.trim().toLowerCase()
  const visible = q ? dashboards.filter(d => d.name.toLowerCase().includes(q)) : dashboards

  return (
    <div className="space-y-0.5">
      {!collapsed && !hideHeader && (
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">Dashboards</p>
          {onCreateClick && (
            <button
              onClick={onCreateClick}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-item-hover transition-colors"
              title="New dashboard"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {visible.map(dashboard => {
        const active = pathname === `/dashboards/${dashboard.id}`
        return (
          <Link
            key={dashboard.id}
            href={`/dashboards/${dashboard.id}`}
            title={collapsed ? dashboard.name : undefined}
            className={cn(
              'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[15px] transition-colors',
              collapsed ? 'justify-center' : '',
              active
                ? 'bg-sidebar-item-active text-foreground'
                : 'text-foreground/80 hover:bg-sidebar-item-hover hover:text-foreground'
            )}
          >
            {dashboard.icon ? (
              <span className="text-base leading-none">{dashboard.icon}</span>
            ) : (
              <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
            )}
            {!collapsed && (
              <span className="truncate text-[15px]">{dashboard.name}</span>
            )}
          </Link>
        )
      })}

      {!collapsed && dashboards.length === 0 && (
        <button
          onClick={onCreateClick}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-item-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create dashboard
        </button>
      )}
    </div>
  )
}
