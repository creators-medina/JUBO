'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Command } from 'cmdk'
import {
  Search, Sparkles, FileText, Columns3, LayoutDashboard, Target, Bookmark,
  CheckSquare, Sunrise, TrendingUp, Plug, Settings, X, XCircle, Clock, Flag,
  ArrowRight, ArrowLeft, ArrowRightLeft, Circle, CircleDot, Zap, CheckCircle2,
  Activity, Link as LinkIcon, Archive, Copy, History, Workflow, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCommandPalette } from '../providers/CommandPaletteProvider'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { useOrganization } from '@/providers/OrganizationProvider'
import { useToast } from '@/features/feedback/ToastProvider'
import { runWorkflowScansAction } from '@/features/workflows/actions'
import { useGlobalSearch } from '../hooks/useGlobalSearch'
import { useRecentItems, pushRecentItem } from '../recent/useRecentItems'
import { useActiveRecordContext } from '../hooks/useActiveRecordContext'
import { useCommandHistory, recordCommandExecution } from '../history/useCommandHistory'
import { getQuickActionItems } from '../actions/registry'
import { contextualCommands } from '../contextual/contextualCommands'
import type { CommandItem, CommandPage, RecentItem } from '../types'

const ICONS: Record<string, React.ElementType> = {
  Search, Sparkles, FileText, Columns3, LayoutDashboard, Target, Bookmark,
  CheckSquare, Sunrise, TrendingUp, Plug, Settings, X, XCircle, Clock, Flag,
  ArrowRightLeft, Circle, CircleDot, Zap, CheckCircle2, Activity, Link: LinkIcon,
  Archive, Copy, History, Workflow, RefreshCw,
}
const IconFor = (name?: string): React.ElementType => (name && ICONS[name]) || Search

export function CommandPalette() {
  const router = useRouter()
  const { isOpen, close } = useCommandPalette()
  const { currentOrganization } = useOrganization()
  const toast = useToast()
  const {
    tabs, openWorkspace, activateWorkspace, closeWorkspace, closeAll,
    activeRecordId, setActiveSubTab,
  } = useWorkspaceTabs()
  const { items: recents } = useRecentItems()
  const { topCommands } = useCommandHistory()

  const [query, setQuery] = useState('')
  const [pages, setPages] = useState<CommandPage[]>([])
  const [pageItems, setPageItems] = useState<CommandItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const activeTab = useMemo(() => tabs.find(t => t.recordId === activeRecordId) ?? null, [tabs, activeRecordId])
  const recordCtx = useActiveRecordContext(isOpen ? activeRecordId : null, activeTab?.activeSubTab)

  const activePage = pages[pages.length - 1] ?? null

  // Reset everything when the palette opens
  useEffect(() => {
    if (isOpen) { setQuery(''); setPages([]); setPageItems([]) }
  }, [isOpen])

  // Load list-page items when navigating into a list page
  useEffect(() => {
    let cancelled = false
    if (activePage?.kind === 'list') {
      setQuery('')
      Promise.resolve(activePage.loadItems()).then(items => {
        if (!cancelled) setPageItems(items)
      })
    } else {
      setPageItems([])
    }
    return () => { cancelled = true }
  }, [activePage])

  const openRecordIds = useMemo(() => tabs.map(t => t.recordId), [tabs])
  const recentRecordIds = useMemo(() => recents.filter(r => r.kind === 'record').map(r => r.id), [recents])

  const searchCtx = {
    organizationId: currentOrganization?.id ?? '',
    query: activePage ? '' : query.trim(),   // global search only at root
    openRecordIds,
    recentRecordIds,
  }
  const { items: serverItems, loading } = useGlobalSearch(searchCtx)

  const popPage = useCallback(() => setPages(p => p.slice(0, -1)), [])
  const pushPage = useCallback((page: CommandPage) => setPages(p => [...p, page]), [])

  // ── Build root-level items ────────────────────────────────────────────────
  const workspaceTabItems: CommandItem[] = useMemo(() => tabs.map(t => ({
    id: `workspace_tab:${t.recordId}`,
    type: 'workspace_tab',
    title: t.title || 'Untitled',
    subtitle: t.recordId === activeRecordId ? 'Open · active' : 'Open in workspace',
    iconName: 'FileText',
    groupLabel: 'Open Workspaces',
    onSelect: () => { activateWorkspace(t.recordId); close() },
  })), [tabs, activeRecordId, activateWorkspace, close])

  const contextualItems: CommandItem[] = useMemo(
    () => contextualCommands(recordCtx, {
      toast,
      close,
      // Provider wants the narrow WorkspaceTabKey; the contextual builder is
      // generic over string, so adapt here.
      setActiveSubTab: (recordId, tab) => setActiveSubTab(recordId, tab as Parameters<typeof setActiveSubTab>[1]),
    }),
    [recordCtx, toast, close, setActiveSubTab],
  )

  const recentItems: CommandItem[] = useMemo(() => recents.slice(0, 6).map(r => ({
    id: `recent:${r.kind}:${r.id}`,
    type: 'recent',
    title: r.title,
    subtitle: r.subtitle ?? r.kind,
    iconName: r.iconName ?? recentDefaultIcon(r),
    groupLabel: 'Recently Opened',
    onSelect: () => handleRecentSelect(r),
  })), [recents]) // eslint-disable-line react-hooks/exhaustive-deps

  const historyItems: CommandItem[] = useMemo(() => topCommands(4).map(h => ({
    id: `history:${h.commandId}`,
    type: 'action',
    title: h.title,
    subtitle: `Used ${h.count}×`,
    iconName: h.iconName ?? 'History',
    groupLabel: 'Frequent',
    // Re-running a history entry just re-opens the palette context; the real
    // command lives in contextual/quick lists. We point users at it by title.
    onSelect: () => {
      const match = [...contextualItems, ...quickActionItems].find(c => c.title === h.title)
      if (match) handleItem(match)
    },
  })), [topCommands, contextualItems]) // eslint-disable-line react-hooks/exhaustive-deps

  const quickActionItems: CommandItem[] = useMemo(() => getQuickActionItems((id) => {
    switch (id) {
      case 'open-today':         return () => { router.push('/today');     close() }
      case 'open-goals':         return () => { router.push('/goals');     close() }
      case 'open-boards':        return () => { router.push('/boards');    close() }
      case 'open-dashboard-hub': return () => { router.push('/dashboard'); close() }
      case 'open-forecasts':     return () => { router.push('/forecasts'); close() }
      case 'open-integrations':  return () => { router.push('/integrations'); close() }
      case 'open-settings':      return () => { router.push('/settings');  close() }
      case 'open-workflows':     return () => { router.push('/settings/workflows'); close() }
      case 'run-workflow-scans':
        return currentOrganization
          ? async () => {
              close()
              try {
                const { scanned } = await runWorkflowScansAction(currentOrganization.id)
                toast.success(`Workflow scan complete · ${scanned} record${scanned === 1 ? '' : 's'}`)
              } catch { toast.error('Workflow scan failed') }
            }
          : undefined
      case 'close-active-workspace':
        return activeRecordId ? () => { closeWorkspace(activeRecordId); close() } : undefined
      case 'close-all-workspaces':
        return tabs.length > 0 ? () => { closeAll(); close() } : undefined
    }
  }), [router, close, activeRecordId, closeWorkspace, closeAll, tabs.length, currentOrganization, toast])

  function handleRecentSelect(r: RecentItem) {
    if (r.kind === 'record') openWorkspace({ recordId: r.id, title: r.title })
    else if (r.href) router.push(r.href)
    pushRecentItem(r)
    close()
  }

  // ── Selection dispatch ──────────────────────────────────────────────────
  const handleItem = useCallback((item: CommandItem) => {
    if (item.intoPage) { pushPage(item.intoPage); return }

    if (item.type === 'record') {
      const recordId = (item.metadata?.recordId as string) ?? item.id.replace(/^record:/, '')
      openWorkspace({ recordId, title: item.title })
      pushRecentItem({ kind: 'record', id: recordId, title: item.title, subtitle: item.subtitle, iconName: item.iconName })
      close(); return
    }
    if (item.type === 'task') {
      const recordId = item.metadata?.recordId as string | undefined
      if (recordId) { openWorkspace({ recordId, title: item.title }); close(); return }
    }
    if (item.onSelect) { item.onSelect(); return }
    if (item.href) {
      if (item.type === 'board')     pushRecentItem({ kind: 'board', id: item.id.replace(/^board:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      else if (item.type === 'dashboard') pushRecentItem({ kind: 'dashboard', id: item.id.replace(/^dashboard:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      else if (item.type === 'goal') pushRecentItem({ kind: 'goal', id: item.id.replace(/^goal:/, ''), title: item.title, subtitle: item.subtitle, iconName: item.iconName, href: item.href })
      router.push(item.href); close()
    }
  }, [pushPage, openWorkspace, close, router])

  // ── Esc handling: back out one page, or close at root ─────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (pages.length > 0) popPage()
      else close()
    }
  }

  // Root grouped items (priority order = insertion order)
  const grouped = useMemo(() => {
    if (activePage) return [] // pages render their own way
    const q = query.trim().toLowerCase()
    const matches = (it: CommandItem) =>
      !q || it.title.toLowerCase().includes(q) || (it.keywords ?? []).some(k => k.toLowerCase().includes(q)) || (it.subtitle ?? '').toLowerCase().includes(q)

    const ordered: CommandItem[] = q
      ? [
          ...workspaceTabItems.filter(matches),
          ...contextualItems.filter(matches),
          ...serverItems,
          ...quickActionItems.filter(matches),
        ]
      : [
          ...workspaceTabItems,
          ...contextualItems,
          ...historyItems,
          ...recentItems,
          ...quickActionItems,
        ]

    const map = new Map<string, CommandItem[]>()
    for (const item of ordered) {
      const g = map.get(item.groupLabel) ?? []
      g.push(item)
      map.set(item.groupLabel, g)
    }
    return [...map.entries()]
  }, [activePage, query, workspaceTabItems, contextualItems, serverItems, quickActionItems, historyItems, recentItems])

  if (!isOpen) return null

  // ── Input page rendering ──────────────────────────────────────────────────
  if (activePage?.kind === 'input') {
    return (
      <PaletteShell onBackdrop={close}>
        <InputPage
          page={activePage}
          onBack={popPage}
          onClose={close}
        />
      </PaletteShell>
    )
  }

  // ── List page or root rendering ──────────────────────────────────────────
  const listPageItems = activePage?.kind === 'list' ? pageItems : null
  const filteredPageItems = listPageItems
    ? listPageItems.filter(it => {
        const q = query.trim().toLowerCase()
        return !q || it.title.toLowerCase().includes(q)
      })
    : null

  return (
    <PaletteShell onBackdrop={close}>
      <Command shouldFilter={false} className="flex flex-col max-h-[70vh]" onKeyDown={handleKeyDown}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          {activePage ? (
            <button onClick={popPage} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Back (Esc)">
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : (
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )}
          {activePage && (
            <span className="text-2xs uppercase tracking-wider text-muted-foreground bg-surface-1 px-1.5 py-0.5 rounded flex-shrink-0">
              {activePage.title}
            </span>
          )}
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder={activePage?.placeholder ?? (recordCtx ? `Act on "${truncate(recordCtx.title, 28)}" or search…` : 'Search records, boards, actions…')}
            className="flex-1 bg-transparent border-0 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
          {loading && !activePage && <Sparkles className="w-3.5 h-3.5 text-muted-foreground animate-pulse flex-shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center text-2xs text-muted-foreground/70 px-1.5 py-0.5 rounded border border-border bg-surface-1">esc</kbd>
        </div>

        <Command.List className="flex-1 overflow-y-auto p-1.5">
          <Command.Empty className="py-10 text-center text-xs text-muted-foreground">
            {loading ? 'Searching…' : 'No matches.'}
          </Command.Empty>

          {/* List page */}
          {filteredPageItems && (
            <Command.Group>
              {filteredPageItems.map(item => <Row key={item.id} item={item} onSelect={() => handleItem(item)} />)}
            </Command.Group>
          )}

          {/* Root grouped */}
          {!activePage && grouped.map(([groupLabel, items]) => (
            <Command.Group
              key={groupLabel}
              heading={groupLabel}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {items.map(item => <Row key={item.id} item={item} onSelect={() => handleItem(item)} />)}
            </Command.Group>
          ))}
        </Command.List>

        <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-t border-border bg-surface-1/40 text-2xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <KbdHint keys={['↑', '↓']} label="navigate" />
            <KbdHint keys={['↵']} label="select" />
            <KbdHint keys={['esc']} label={pages.length > 0 ? 'back' : 'close'} />
          </div>
          {recordCtx && !activePage && (
            <span className="hidden md:inline truncate max-w-[200px]">Context · {recordCtx.title}</span>
          )}
        </div>
      </Command>
    </PaletteShell>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────

function PaletteShell({ children, onBackdrop }: { children: React.ReactNode; onBackdrop: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in-0 duration-100" onClick={onBackdrop} />
      <div className="relative w-full max-w-[680px] mx-4 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150">
        {children}
      </div>
    </div>
  )
}

function Row({ item, onSelect }: { item: CommandItem; onSelect: () => void }) {
  const Icon = IconFor(item.iconName)
  return (
    <Command.Item
      value={`${item.id} ${item.title} ${item.subtitle ?? ''} ${(item.keywords ?? []).join(' ')}`}
      onSelect={onSelect}
      className={cn(
        'group flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer text-sm transition-colors',
        'data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground hover:bg-surface-1',
      )}
    >
      <span className="w-6 h-6 rounded-md bg-surface-1 flex items-center justify-center flex-shrink-0 text-muted-foreground group-data-[selected=true]:bg-primary/15 group-data-[selected=true]:text-primary">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-foreground truncate">{item.title}</p>
        {item.subtitle && <p className="text-2xs text-muted-foreground truncate">{item.subtitle}</p>}
      </div>
      {item.preview && (
        <span className="text-2xs text-muted-foreground bg-surface-1 px-1.5 py-0.5 rounded flex-shrink-0 max-w-[140px] truncate">
          {item.preview}
        </span>
      )}
      {item.intoPage
        ? <ArrowRight className="w-3 h-3 text-muted-foreground/60 flex-shrink-0" />
        : <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100 flex-shrink-0" />}
    </Command.Item>
  )
}

function InputPage({ page, onBack, onClose }: { page: Extract<CommandPage, { kind: 'input' }>; onBack: () => void; onClose: () => void }) {
  const [value, setValue] = useState(page.initialValue ?? '')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!value.trim() || submitting) return
    setSubmitting(true)
    try { await page.onSubmit(value) } finally { setSubmitting(false) }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onBack(); return }
    if (e.key === 'Enter' && (!page.multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault(); submit()
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
        <button onClick={onBack} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Back (Esc)">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-2xs uppercase tracking-wider text-muted-foreground bg-surface-1 px-1.5 py-0.5 rounded">{page.title}</span>
      </div>
      <div className="p-3 space-y-3">
        {page.multiline ? (
          <textarea
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={page.placeholder}
            rows={4}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={page.placeholder}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
        <div className="flex items-center justify-between">
          <span className="text-2xs text-muted-foreground">
            {page.multiline ? 'Cmd+Enter to save · Esc to back' : 'Enter to save · Esc to back'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-2.5 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors">Cancel</button>
            <button
              onClick={submit}
              disabled={!value.trim() || submitting}
              className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Saving…' : (page.submitLabel ?? 'Save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map(k => <kbd key={k} className="px-1.5 py-0.5 rounded border border-border bg-surface-1 text-foreground/80 tabular-nums">{k}</kbd>)}
      <span>{label}</span>
    </span>
  )
}

function recentDefaultIcon(r: RecentItem): string {
  switch (r.kind) {
    case 'record':        return 'FileText'
    case 'board':         return 'Columns3'
    case 'dashboard':     return 'LayoutDashboard'
    case 'goal':          return 'Target'
    case 'workspace_tab': return 'FileText'
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
