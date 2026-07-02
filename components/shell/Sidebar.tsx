'use client'

// ─────────────────────────────────────────────────────────────────────────
// Sidebar — workflow-first navy shell (Board Redesign reference):
//   • Jubo workspace block, then a Jump-to filter box (⌘K focuses it)
//   • compact utility links (Dashboard · Prospecting · Today)
//   • Work Loans Pipeline card + GENERATE / WORK LOANS board sections
//     (rendered by DynamicBoardsSidebarSection — real counts & values)
//   • INSIGHTS — dashboards + business analytics links
//   • SETUP — automations & tools
//   • bottom profile/workspace card
// Every route is unchanged; sections only regroup existing links. The jump
// box filters nav items client-side — no search backend, no fake results.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Target,
  Gauge,
  Sunrise,
  PhoneCall,
  TrendingUp,
  Plug,
  Settings,
  Workflow,
  Upload,
  FileJson,
  ChevronLeft,
  ChevronRight,
  Search,
  LineChart,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarItem } from './SidebarItem'
import { DynamicBoardsSidebarSection, SectionHeader } from '@/features/boards/components/DynamicBoardsSidebarSection'
import { DynamicDashboardsSidebarSection } from '@/features/dashboards/components/DynamicDashboardsSidebarSection'
import { CreateDashboardModal } from '@/features/dashboards/components/CreateDashboardModal'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useSidebarSectionCollapsed } from '@/hooks/useSidebarSectionCollapsed'

// Utility links pinned above the workflow sections (routes unchanged).
const UTILITY_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/prospecting', label: 'Prospecting', icon: PhoneCall },
  { href: '/today', label: 'Today', icon: Sunrise },
]

// INSIGHTS — analytics links (previously "Business"); dashboards render above.
const INSIGHTS_ITEMS = [
  { href: '/business-plan', label: 'Business Plan', icon: Gauge },
  { href: '/goals', label: 'Goals', icon: Target },
  { href: '/forecasts', label: 'Forecasts', icon: TrendingUp },
]

// SETUP — automations & tools (previously "Operations"); routes unchanged.
const SETUP_ITEMS = [
  { href: '/settings/workflows', label: 'Workflows', icon: Workflow },
  { href: '/imports', label: 'Imports', icon: Upload },
  { href: '/blueprints', label: 'Blueprint Import', icon: FileJson },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings', label: 'Settings', icon: Settings },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { currentOrganization } = useOrganization()
  const { user } = useAuth()
  const [showCreateDashboard, setShowCreateDashboard] = useState(false)
  const [filter, setFilter] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Monday-style collapsible groups (localStorage-persisted, default open).
  const insightsSection = useSidebarSectionCollapsed('insights')
  const setupSection = useSidebarSectionCollapsed('setup')

  // ⌘K / Ctrl+K focuses the jump box (real shortcut, not a decorative hint).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const q = filter.trim().toLowerCase()
  const matchItems = <T extends { label: string }>(items: T[]) =>
    q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items

  const isActive = (href: string) =>
    href === '/settings'
      ? pathname === '/settings' || (pathname.startsWith('/settings') && !pathname.startsWith('/settings/workflows') && !pathname.startsWith('/settings/integrations'))
      : href === '/dashboard'
        ? pathname === '/dashboard' || pathname.startsWith('/dashboards/')
        : pathname.startsWith(href)

  // Profile card identity — real user/org data only.
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Account'
  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join('') || 'J'
  const roleLabel = currentOrganization?.role
    ? currentOrganization.role.charAt(0).toUpperCase() + currentOrganization.role.slice(1)
    : null

  const visInsights = matchItems(INSIGHTS_ITEMS)
  const visSetup = matchItems(SETUP_ITEMS)
  const visUtility = matchItems(UTILITY_ITEMS)

  // Keep the active route discoverable: open its section on route changes
  // (stable callbacks → a manual collapse on the same route is respected).
  const insightsActive = pathname.startsWith('/dashboards/') || INSIGHTS_ITEMS.some((i) => pathname.startsWith(i.href))
  const setupActive = SETUP_ITEMS.some((i) => pathname.startsWith(i.href)) || pathname.startsWith('/settings')
  const forceOpenInsights = insightsSection.forceOpen
  const forceOpenSetup = setupSection.forceOpen
  useEffect(() => { if (insightsActive) forceOpenInsights() }, [insightsActive, pathname, forceOpenInsights])
  useEffect(() => { if (setupActive) forceOpenSetup() }, [setupActive, pathname, forceOpenSetup])

  return (
    <aside
      className={cn(
        'jubo-navy-chrome relative flex h-full flex-col border-r border-sidebar-border bg-sidebar-bg transition-all duration-200 ease-in-out',
        collapsed ? 'w-14' : 'w-64'
      )}
    >
      {/* Workspace block */}
      <div className="flex h-12 flex-shrink-0 items-center border-b border-sidebar-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[#e6c478]">
            <span className="text-xs font-black text-[#0f1d3d]">J</span>
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-base font-semibold leading-none text-foreground">Jubo</p>
              {currentOrganization && (
                <p className="mt-0.5 truncate text-xs text-foreground/70">{currentOrganization.name}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Jump-to filter (client-side; ⌘K focuses) */}
      {!collapsed && (
        <div className="flex-shrink-0 px-2 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/40" />
            <input
              ref={searchRef}
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Jump to…"
              className="h-8 w-full rounded-lg border border-white/10 bg-white/[0.06] pl-8 pr-9 text-xs text-foreground placeholder:text-foreground/40 focus:border-white/25 focus:outline-none"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-white/[0.06] px-1 text-[9px] text-foreground/40">
              ⌘K
            </kbd>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {/* Utility links */}
        {visUtility.length > 0 && (
          <div className="space-y-0.5">
            {visUtility.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </div>
        )}

        {/* Pipeline card + GENERATE / WORK LOANS board sections (real data). */}
        <DynamicBoardsSidebarSection collapsed={collapsed} filter={filter} />

        {/* INSIGHTS — dashboards + analytics links. */}
        {(!collapsed || visInsights.length > 0) && (
          <div className="space-y-0.5">
            {!collapsed && (
              <SectionHeader
                icon={<LineChart className="h-3.5 w-3.5" />}
                chipClass="bg-violet-400/15 text-violet-300"
                label="Insights"
                sublabel="Dashboards"
                onAdd={() => setShowCreateDashboard(true)}
                addTitle="New dashboard"
                isCollapsed={insightsSection.collapsed && !q}
                onToggle={insightsSection.toggle}
              />
            )}
            {(collapsed || !insightsSection.collapsed || !!q) && (<>
            <DynamicDashboardsSidebarSection
              collapsed={collapsed}
              onCreateClick={() => setShowCreateDashboard(true)}
              hideHeader
              filter={filter}
            />
            {visInsights.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
            </>)}
          </div>
        )}

        {/* SETUP — automations & tools. */}
        {visSetup.length > 0 && (
          <div className="space-y-0.5">
            {!collapsed && (
              <SectionHeader
                icon={<Wrench className="h-3.5 w-3.5" />}
                chipClass="bg-amber-400/15 text-amber-300"
                label="Setup"
                sublabel="Automations & tools"
                isCollapsed={setupSection.collapsed && !q}
                onToggle={setupSection.toggle}
              />
            )}
            {(collapsed || !setupSection.collapsed || !!q) && visSetup.map((item) => (
              <SidebarItem
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={isActive(item.href)}
                collapsed={collapsed}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Bottom profile / workspace card */}
      <div className="flex-shrink-0 border-t border-sidebar-border p-2">
        <div className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5', collapsed && 'justify-center px-0')}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-foreground">
            {initials}
          </div>
          {!collapsed && (
            <>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold text-foreground">
                  {currentOrganization?.name ?? 'Workspace'}
                </p>
                <p className="truncate text-[11px] text-foreground/55">
                  {roleLabel ? `${roleLabel} · ` : ''}{displayName}
                </p>
              </div>
              <Link
                href="/settings"
                title="Settings"
                className="flex-shrink-0 rounded p-1 text-foreground/50 transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
              >
                <Settings className="h-4 w-4" />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-14 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
      </button>

      {showCreateDashboard && currentOrganization && (
        <CreateDashboardModal
          organizationId={currentOrganization.id}
          onClose={() => setShowCreateDashboard(false)}
          onSuccess={(id) => {
            setShowCreateDashboard(false)
            router.push(`/dashboards/${id}`)
          }}
        />
      )}
    </aside>
  )
}
