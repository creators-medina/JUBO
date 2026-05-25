'use client'

import { useMemo, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Search, Sparkles, FileText, Columns3, LayoutDashboard, Target, Bookmark,
  CheckSquare, Sunrise, TrendingUp, Plug, Settings, X, XCircle, Clock, Flag, ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCommandPalette } from '../providers/CommandPaletteProvider'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useRecentItems, pushRecentItem } from '../recent/useRecentItems'
import { getQuickActionItems } from '../actions/registry'
import type { CommandItem, RecentItem } from '../types'

// Stringly-typed icons keep the registry serializable. Map them here.
const ICONS: Record<string, React.ElementType> = {
  Search, Sparkles, FileText, Columns3, LayoutDashboard, Target, Bookmark,
  CheckSquare, Sunrise, TrendingUp, Plug, Settings, X, XCircle, Clock, Flag,
}

function IconFor(name?: string): React.ElementType {
  if (!name) return Search
  return ICONS[name] ?? Search
}

export function CommandPalette() {
  const router = useRouter()
  const { isOpen, close } = useCommandPalette()
  const { currentOrganization } = useOrganization()
  const { tabs, openWorkspace, activateWorkspace, closeWorkspace, closeAll, activeRecordId } = useWorkspaceTabs()
  const { items: recents } = useRecentItems()

  const [query, setQuery] = useState('')

  // Reset query each time the palette opens so users always start fresh.
  useEffect(() => { if (isOpen) setQuery('') }, [isOpen])

  const openRecordIds = useMemo(() => tabs.map(t => t.recordId), [tabs])
  const recentRecordIds = useMemo(
    () => recents.filter(r => r.kind === 'record').map(r => r.id),
    [recents],
  )

  const searchCtx = {
    organizationId: currentOrganization?.id ?? '',
    query: query.trim(),
    openRecordIds,
    recentRecordIds,
  }

  const { items: serverItems, loading } = useGlobalSearch(searchCtx)

  // ── Local items: open workspaces, quick actions, recents ─────────────────
  const workspaceTabItems: CommandItem[] = useMemo(() => tabs.map(t => ({
    id:         `workspace_tab:${t.recordId}`,
    type:       'workspace_tab',
    title:      t.title || 'Untitled',
    subtitle:   t.recordId === activeRecordId ? 'Open · active' : 'Open in workspace',
    iconName:   'FileText',
    groupLabel: 'Open Workspaces',
    onSelect:   () => { activateWorkspace(t.recordId); close() },
  })), [tabs, activeRecordId, activateWorkspace, close])

  const recentItems: CommandItem[] = useMemo(() => recents.slice(0, 6).map(r => ({
    id:         `recent:${r.kind}:${r.id}`,
    type:       'recent',
    title:      r.title,
    subtitle:   r.subtitle ?? r.kind,
    iconName:   r.iconName ?? recentDefaultIcon(r),
    groupLabel: 'Recently Opened',
    onSelect:   () => handleRecentSelect(r),
  })), [recents])

  function handleRecentSelect(r: RecentItem) {
    if (r.kind === 'record') {
      openWorkspace({ recordId: r.id, title: r.title })
    } else if (r.href) {
      router.push(r.href)
    }
    pushRecentItem(r)
    close()
  }

  const quickActionItems: CommandItem[] = useMemo(() => getQuickActionItems((id) => {
    switch (id) {
      case 'open-today':         return () => { router.push('/today');     close() }
      case 'open-goals':         return () => { router.push('/goals');     close() }
      case 'open-boards':        return () => { router.push('/boards');    close() }
      case 'open-dashboard-hub': return () => { router.push('/dashboard'); close() }
      case 'open-forecasts':     return () => { router.push('/forecasts'); close() }
      case 'open-integrations':  return () => { router.push('/integrations'); close() }
      case 'open-settings':      return () => { router.push('/settings');  close() }
      case 'close-active-workspace':
        return activeRecordId ? () => { closeWorkspace(activeRecordId); close() } : undefined
      case 'close-all-workspaces':
        return tabs.length > 0 ? () => { closeAll(); close() } : undefined
    }
  }), [router, close, activeRecordId, closeWorkspace, closeAll, tabs.length])

  // Merge + group. cmdk handles filtering when value is given, but we already
  // filter server-side, so we hand it the (cmdk-friendly) value string.
  const allItems = useMemo(() => {
    if (!query.trim()) {
      // Empty-query default: workspace tabs first, recents, then quick actions
      return [...workspaceTabItems, ...recentItems, ...quickActionItems]
    }
    // With query: workspace tabs first (already open trumps), then server results, then matching actions
    const q = query.toLowerCase()
    const actionMatches = quickActionItems.filter(a =>
      a.title.toLowerCase().includes(q) || (a.keywords ?? []).some(k => k.toLowerCase().includes(q)),
    )
    return [...workspaceTabItems, ...serverItems, ...actionMatches]
  }, [query, workspaceTabItems, recentItems, quickActionItems, serverItems])

  // Group items for rendering
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>()
    for (const item of allItems) {
      const g = map.get(item.groupLabel) ?? []
      g.push(item)
      map.set(item.groupLabel, g)
    }
    // Preserve insertion order (which already reflects priority)
    return [...map.entries()]
  }, [allItems])

  const handleSelect = (item: CommandItem) => {
    if (item.type === 'record') {
      const recordId = (item.metadata?.recordId as string) ?? item.id.replace(/^record:/, '')
      openWorkspace({ recordId, title: item.title })
      pushRecentItem({
        kind: 'record', id: recordId, title: item.title,
        subtitle: item.subtitle, iconName: item.iconName,
      })
      close()
      return
    }
    if (item.type === 'task') {
      const recordId = item.metadata?.recordId as string | undefined
      if (recordId) {
        openWorkspace({ recordId, title: item.title })
        close()
        return
      }
    }
    if (item.onSelect) { item.onSelect(); return }
    if (item.href) {
      // Track recents for nav items
      if (item.type === 'board') {
        pushRecentItem({ kind: 'board', id: item.id.replace(/^board:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      } else if (item.type === 'dashboard') {
        pushRecentItem({ kind: 'dashboard', id: item.id.replace(/^dashboard:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      } else if (item.type === 'goal') {
        pushRecentItem({ kind: 'goal', id: item.id.replace(/^goal:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      }
      router.push(item.href)
      close()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-100" onClick={close} />
      <div className="relative w-full max-w-[680px] mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
        <Command shouldFilter={false} className="flex flex-col max-h-[70vh]">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search records, boards, dashboards, actions…"
              className="flex-1 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            {loading && <Sparkles className="w-3.5 h-3.5 text-muted-foreground animate-pulse flex-shrink-0" />}
            <kbd className="hidden sm:inline-flex items-center gap-1 text-2xs text-muted-foreground/70 px-1.5 py-0.5 rounded border border-border bg-surface-1">
              esc
            </kbd>
          </div>

          <Command.List className="flex-1 overflow-y-auto p-1.5">
            <Command.Empty className="py-10 text-center text-xs text-muted-foreground">
              {loading ? 'Searching…' : 'No matches. Try a different query.'}
            </Command.Empty>

            {grouped.map(([groupLabel, items]) => (
              <Command.Group
                key={groupLabel}
                heading={groupLabel}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {items.map(item => {
                  const Icon = IconFor(item.iconName)
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.id} ${item.title} ${item.subtitle ?? ''} ${(item.keywords ?? []).join(' ')}`}
                      onSelect={() => handleSelect(item)}
                      className={cn(
                        'group flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors',
                        'data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground',
                        'hover:bg-surface-1',
                      )}
                    >
                      <span className="w-6 h-6 rounded-md bg-surface-1 flex items-center justify-center flex-shrink-0 text-muted-foreground group-data-[selected=true]:bg-primary/15 group-data-[selected=true]:text-primary">
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-foreground truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-2xs text-muted-foreground truncate">{item.subtitle}</p>
                        )}
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 flex-shrink-0" />
                    </Command.Item>
                  )
                })}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer hint */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-border bg-surface-1/40 text-2xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <KbdHint keys={['↑', '↓']} label="navigate" />
              <KbdHint keys={['↵']} label="select" />
              <KbdHint keys={['esc']} label="close" />
            </div>
            <span className="hidden md:inline">Cmd+K to toggle</span>
          </div>
        </Command>
      </div>
    </div>
  )
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map(k => (
        <kbd key={k} className="px-1.5 py-0.5 rounded border border-border bg-surface-1 text-foreground/80 tabular-nums">{k}</kbd>
      ))}
      <span>{label}</span>
    </span>
  )
}

function recentDefaultIcon(r: RecentItem): string {
  switch (r.kind) {
    case 'record':         return 'FileText'
    case 'board':          return 'Columns3'
    case 'dashboard':      return 'LayoutDashboard'
    case 'goal':           return 'Target'
    case 'workspace_tab':  return 'FileText'
  }
}
