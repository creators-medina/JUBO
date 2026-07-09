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
  Calculator,
  ChevronLeft,
  ChevronRight,
  Search,
  LineChart,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SidebarItem } from './SidebarItem'
import {
  DynamicBoardsSidebarSection, SectionHeader, AllBoardsRow,
  ALLBOARDS_DND_TYPE, parseAllBoardsSlot,
} from '@/features/boards/components/DynamicBoardsSidebarSection'
import { useSidebarSectionLabel } from '@/hooks/useSidebarSectionLabel'
import { useSidebarSlot } from '@/hooks/useSidebarSlot'
import { useSidebarNavLayout } from '@/hooks/useSidebarNavLayout'
import { DynamicDashboardsSidebarSection } from '@/features/dashboards/components/DynamicDashboardsSidebarSection'
import { CreateDashboardModal } from '@/features/dashboards/components/CreateDashboardModal'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useAuth } from '@/providers/AuthProvider'
import { useSidebarSectionCollapsed } from '@/hooks/useSidebarSectionCollapsed'

// ── Normalized nav model ──
// Every shell link is one registry entry (id = route); which group it lives
// in and where is a per-browser layout preference (useSidebarNavLayout).
// System items stay UI-layer synthetic — no synthetic ids ever reach backend
// tables that expect real board ids.
const NAV_LINKS: Record<string, { label: string; icon: LucideIcon }> = {
  '/dashboard': { label: 'Dashboard', icon: LayoutDashboard },
  '/prospecting': { label: 'Daily Call Log', icon: PhoneCall },
  '/today': { label: 'Today', icon: Sunrise },
  // Operator audit: the coaching-engine page keeps its route but is labeled
  // as coaching so it can't be mistaken for the (canonical) Production Plan.
  '/business-plan': { label: 'Business Coaching', icon: Gauge },
  '/production-plan': { label: 'Production Plan', icon: Calculator },
  '/goals': { label: 'Goals', icon: Target },
  '/forecasts': { label: 'Forecasts', icon: TrendingUp },
  '/settings/workflows': { label: 'Workflows', icon: Workflow },
  '/imports': { label: 'Imports', icon: Upload },
  '/blueprints': { label: 'Blueprint Import', icon: FileJson },
  '/settings/integrations': { label: 'Integrations', icon: Plug },
  '/settings': { label: 'Settings', icon: Settings },
}
type NavGroupKey = 'utility' | 'insights' | 'setup'
// Movable group blocks in default order (utility stays pinned at the top;
// its ITEMS are still movable like everything else).
const DEFAULT_GROUP_ORDER = ['boards', 'insights', 'setup'] as const
const DEFAULT_GROUP_ITEMS: Record<NavGroupKey, readonly string[]> = {
  utility: ['/dashboard', '/prospecting', '/today'],
  insights: ['/business-plan', '/production-plan', '/goals', '/forecasts'],
  setup: ['/settings/workflows', '/imports', '/blueprints', '/settings/integrations', '/settings'],
}
const NAVLINK_DND_TYPE = 'text/jubo-navlink'
const NAVGROUP_DND_TYPE = 'text/jubo-navgroup'

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
  const insightsLabel = useSidebarSectionLabel('insights', 'Insights')
  const setupLabel = useSidebarSectionLabel('setup', 'Setup')

  // Customizable layout: group-block order + which group each link lives in.
  const layout = useSidebarNavLayout(DEFAULT_GROUP_ORDER, DEFAULT_GROUP_ITEMS)
  // "All Boards" placement — shared slot with the boards section, so the
  // system item can live in ANY group (boards sections or shell groups).
  const allBoardsSlot = useSidebarSlot('allboards', 'bottom')
  const allBoardsPlacement = parseAllBoardsSlot(allBoardsSlot.slot)
  const [draggingAllBoards, setDraggingAllBoards] = useState(false)
  const [draggingNavId, setDraggingNavId] = useState<string | null>(null)
  const [navOverId, setNavOverId] = useState<string | null>(null)

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

  // Keep the active route discoverable: open its section on route changes.
  // Group membership is layout-driven, so a moved item opens its NEW group.
  const groupHasActive = (g: NavGroupKey) => layout.itemsFor(g).some((href) => isActive(href))
  const insightsActive = pathname.startsWith('/dashboards/') || groupHasActive('insights')
  const setupActive = groupHasActive('setup')
  const forceOpenInsights = insightsSection.forceOpen
  const forceOpenSetup = setupSection.forceOpen
  useEffect(() => { if (insightsActive) forceOpenInsights() }, [insightsActive, pathname, forceOpenInsights])
  useEffect(() => { if (setupActive) forceOpenSetup() }, [setupActive, pathname, forceOpenSetup])

  // ── Drag & drop plumbing (native HTML5, same pattern as the board lists) ──
  const dndEnabled = !q && !collapsed

  /** Drop a nav link or the All Boards item onto a link row. Same semantics
   *  as board reorder: moving down lands after the target, up/cross-group
   *  lands before it. */
  const dropOnLink = (e: React.DragEvent, targetId: string, group: NavGroupKey) => {
    const isAllBoards = e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)
    const draggedId = e.dataTransfer.getData(NAVLINK_DND_TYPE)
    if (!isAllBoards && !draggedId) return
    e.preventDefault()
    e.stopPropagation()
    setNavOverId(null); setDraggingNavId(null)
    const arr = layout.itemsFor(group)
    const k = arr.indexOf(targetId)
    if (k < 0) return
    if (isAllBoards) {
      const cur = allBoardsPlacement
      const movingDown = cur.section === group && Math.min(cur.index, arr.length) <= k
      allBoardsSlot.setSlot(`${group}:${movingDown ? k + 1 : k}`)
      return
    }
    if (draggedId === targetId) return
    layout.moveItem(draggedId, group, k)
  }

  /** Group-container drop — landing on empty space appends to the group. */
  const groupContainerDnD = (group: NavGroupKey) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dndEnabled) return
      if (!e.dataTransfer.types.includes(NAVLINK_DND_TYPE) && !e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: React.DragEvent) => {
      const isAllBoards = e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)
      const draggedId = e.dataTransfer.getData(NAVLINK_DND_TYPE)
      if (!isAllBoards && !draggedId) return
      e.preventDefault()
      setNavOverId(null); setDraggingNavId(null)
      const arr = layout.itemsFor(group)
      if (isAllBoards) allBoardsSlot.setSlot(`${group}:${arr.length}`)
      else layout.moveItem(draggedId, group, arr.length)
    },
  })

  /** Group-header drag/drop — reorders the movable blocks (boards/insights/setup).
   *  targetOnly: the block accepts group drops but isn't itself a drag source
   *  (the boards block's inner rows/headers have their own drags). */
  const groupHeaderDnD = (key: string, { targetOnly = false } = {}) => ({
    draggable: dndEnabled && !targetOnly,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(NAVGROUP_DND_TYPE, key)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(NAVGROUP_DND_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(NAVGROUP_DND_TYPE)) return
      e.preventDefault()
      const dragged = e.dataTransfer.getData(NAVGROUP_DND_TYPE)
      if (dragged && dragged !== key) layout.moveGroup(dragged, key)
    },
  })

  /** A group's rows: its links (layout order) with the All Boards system row
   *  spliced in when it lives here — one list, one spacing rhythm. */
  const renderGroupItems = (group: NavGroupKey) => {
    const ids = layout.itemsFor(group).filter((id) => NAV_LINKS[id] && (!q || NAV_LINKS[id].label.toLowerCase().includes(q)))
    const rows = ids.map((id) => {
      const item = NAV_LINKS[id]
      const isOver = navOverId === id && (draggingAllBoards || (draggingNavId != null && draggingNavId !== id))
      return (
        <div
          key={id}
          draggable={dndEnabled}
          onDragStart={(e) => {
            e.dataTransfer.setData(NAVLINK_DND_TYPE, id)
            e.dataTransfer.effectAllowed = 'move'
            setDraggingNavId(id)
          }}
          onDragEnd={() => { setDraggingNavId(null); setNavOverId(null) }}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(NAVLINK_DND_TYPE) && !e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (navOverId !== id) setNavOverId(id)
          }}
          onDrop={(e) => dropOnLink(e, id, group)}
          className={cn(
            'rounded-md',
            dndEnabled && 'cursor-grab active:cursor-grabbing',
            draggingNavId === id && 'opacity-40',
            isOver && 'ring-1 ring-inset ring-white/30',
          )}
        >
          <SidebarItem href={id} label={item.label} icon={item.icon} active={isActive(id)} collapsed={collapsed} />
        </div>
      )
    })
    if (!q && !collapsed && allBoardsPlacement.section === group) {
      rows.splice(Math.min(allBoardsPlacement.index, rows.length), 0, (
        <AllBoardsRow
          key="all-boards"
          active={pathname === '/boards'}
          dragging={draggingAllBoards}
          onDragState={setDraggingAllBoards}
        />
      ))
    }
    return rows
  }

  return (
    <aside
      data-app-sidebar
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

      {/* Nav — utility pinned on top; the group BLOCKS below render in the
          user's saved order (drag a group header to reorder blocks). */}
      <nav data-sidebar-scroll className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {/* Utility links (pinned block; items still movable). */}
        <div className="space-y-0.5" {...groupContainerDnD('utility')}>
          {renderGroupItems('utility')}
        </div>

        {layout.groupOrder.map((g) => {
          if (g === 'boards') {
            // Boards block — a group-reorder DROP target (drag the Insights/
            // Setup headers around it); its internal DnD is untouched.
            return (
              <div key="boards" {...groupHeaderDnD('boards', { targetOnly: true })}>
                <DynamicBoardsSidebarSection collapsed={collapsed} filter={filter} />
              </div>
            )
          }
          if (g === 'insights') {
            return (
              <div key="insights" className="space-y-0.5" {...groupContainerDnD('insights')}>
                {!collapsed && (
                  <div {...groupHeaderDnD('insights')} className={cn(dndEnabled && 'cursor-grab active:cursor-grabbing')} title="Drag to reorder sections">
                    <SectionHeader
                      icon={<LineChart className="h-3.5 w-3.5" />}
                      chipClass="bg-violet-400/15 text-violet-300"
                      label={insightsLabel.label}
                      sublabel="Dashboards"
                      onAdd={() => setShowCreateDashboard(true)}
                      addTitle="New dashboard"
                      isCollapsed={insightsSection.collapsed && !q}
                      onToggle={insightsSection.toggle}
                      onRenameLabel={insightsLabel.rename}
                    />
                  </div>
                )}
                {(collapsed || !insightsSection.collapsed || !!q) && (<>
                <DynamicDashboardsSidebarSection
                  collapsed={collapsed}
                  onCreateClick={() => setShowCreateDashboard(true)}
                  hideHeader
                  filter={filter}
                />
                {renderGroupItems('insights')}
                </>)}
              </div>
            )
          }
          // Under an active jump-filter, hide the block when nothing matches.
          if (q && renderGroupItems('setup').length === 0) return null
          return (
            <div key="setup" className="space-y-0.5" {...groupContainerDnD('setup')}>
              {!collapsed && (
                <div {...groupHeaderDnD('setup')} className={cn(dndEnabled && 'cursor-grab active:cursor-grabbing')} title="Drag to reorder sections">
                  <SectionHeader
                    icon={<Wrench className="h-3.5 w-3.5" />}
                    chipClass="bg-amber-400/15 text-amber-300"
                    label={setupLabel.label}
                    sublabel="Automations & tools"
                    isCollapsed={setupSection.collapsed && !q}
                    onToggle={setupSection.toggle}
                    onRenameLabel={setupLabel.rename}
                  />
                </div>
              )}
              {(collapsed || !setupSection.collapsed || !!q) && renderGroupItems('setup')}
            </div>
          )
        })}
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

      {/* Collapse toggle — straddles the sidebar/content divider, so it must
          be a SOLID chip (explicit navy + shadow). The navy-chrome scoped
          tokens it used before are translucent whites that read as a broken
          smudge over the light content side. */}
      <button
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-14 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-jubo-navy text-white/80 shadow-md transition-colors hover:bg-jubo-navy2 hover:text-white"
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
