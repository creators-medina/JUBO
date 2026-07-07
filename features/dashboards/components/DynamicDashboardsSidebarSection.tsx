'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import * as Icons from 'lucide-react'
import { LayoutDashboard, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { archiveDashboard } from '@/features/dashboards/actions'
import { cn } from '@/lib/utils'

interface DashboardItem {
  id: string
  name: string
  icon: string | null
}

/** Dashboards store either an emoji or a lucide icon NAME (e.g. "Sunrise").
 *  Rendering the name as text made rows read "Sunrise Win the Day" — resolve
 *  real lucide names to the icon component; anything else renders as-is. */
function DashboardIcon({ icon }: { icon: string | null }) {
  if (icon && /^[A-Za-z][A-Za-z0-9]*$/.test(icon)) {
    const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[icon]
    if (C) return <C className="h-4 w-4 flex-shrink-0" />
  }
  if (icon) return <span className="text-base leading-none">{icon}</span>
  return <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
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

  // Remove from the sidebar via the EXISTING soft-archive mechanism
  // (is_archived flag — reversible; widgets/data are never deleted).
  const removeDashboard = async (d: DashboardItem) => {
    const ok = window.confirm(
      `Remove "${d.name}" from the sidebar?\n\nThe dashboard is archived (recoverable) — nothing is deleted.`,
    )
    if (!ok) return
    const prev = dashboards
    setDashboards(prev.filter((x) => x.id !== d.id)) // optimistic
    try {
      await archiveDashboard(d.id)
    } catch {
      setDashboards(prev) // rollback — it stays visible
    }
  }

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
          <div key={dashboard.id} className="group/dash relative">
            <Link
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
              <DashboardIcon icon={dashboard.icon} />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-[15px]">{dashboard.name}</span>
              )}
            </Link>
            {!collapsed && (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); void removeDashboard(dashboard) }}
                title={`Remove "${dashboard.name}" from the sidebar (archives it — recoverable, nothing deleted)`}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-foreground/40 opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover/dash:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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
