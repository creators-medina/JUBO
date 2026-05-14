'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Columns3,
  Target,
  Zap,
  TrendingUp,
  Plug,
  Settings,
  ChevronLeft,
  ChevronRight,
  Command,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarSection } from './SidebarSection'
import { SidebarItem } from './SidebarItem'
import { DynamicBoardsSidebarSection } from '@/features/boards/components/DynamicBoardsSidebarSection'
import { useOrganization } from '@/providers/OrganizationProvider'

const toolItems = [
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/actions', label: 'Daily Actions', icon: Zap },
  { href: '/forecasts', label: 'Forecasts', icon: TrendingUp },
  { href: '/integrations', label: 'Integrations', icon: Plug },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const { currentOrganization } = useOrganization()

  return (
    <aside
      className={cn(
        'relative flex flex-col h-full bg-sidebar-bg border-r border-sidebar-border transition-all duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-56'
      )}
    >
      {/* Logo + org name */}
      <div className="flex items-center h-12 px-3 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center flex-shrink-0">
            <Command className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground leading-none truncate">Jubo</p>
              {currentOrganization && (
                <p className="text-2xs text-muted-foreground truncate mt-0.5">{currentOrganization.name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-4 px-2">
        {/* Dashboard */}
        <SidebarSection label="" collapsed={collapsed}>
          <SidebarItem
            href="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            active={pathname === '/dashboard'}
            collapsed={collapsed}
          />
        </SidebarSection>

        {/* Boards */}
        <div className="space-y-0.5">
          <SidebarItem
            href="/boards"
            label="All Boards"
            icon={Columns3}
            active={pathname === '/boards'}
            collapsed={collapsed}
          />
          <DynamicBoardsSidebarSection collapsed={collapsed} />
        </div>

        {/* Tools */}
        <SidebarSection label={collapsed ? '' : 'Tools'} collapsed={collapsed}>
          {toolItems.map(item => (
            <SidebarItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </SidebarSection>
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-3">
        <SidebarItem
          href="/settings"
          label="Settings"
          icon={Settings}
          active={pathname.startsWith('/settings')}
          collapsed={collapsed}
        />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-14 z-10 w-6 h-6 rounded-full bg-surface-2 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>
    </aside>
  )
}
