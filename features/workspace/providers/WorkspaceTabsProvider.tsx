'use client'

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { MAX_OPEN_WORKSPACES, type WorkspaceTab } from '../types'
import { pushRecentItem } from '@/features/command/recent/useRecentItems'

interface Ctx {
  tabs: WorkspaceTab[]
  activeRecordId: string | null
  isOpen: boolean
  openWorkspace: (input: { recordId: string; title?: string }) => void
  closeWorkspace: (recordId: string) => void
  closeAll: () => void
  activateWorkspace: (recordId: string) => void
}

const WorkspaceTabsContext = createContext<Ctx | null>(null)

const STORAGE_KEY = 'jubo.workspace.tabs.v1'

type Persisted = { tabs: WorkspaceTab[]; activeRecordId: string | null }

function loadPersisted(): Persisted | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Persisted
    if (!Array.isArray(parsed.tabs)) return null
    return parsed
  } catch { return null }
}

function savePersisted(state: Persisted): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([])
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount
  useEffect(() => {
    const p = loadPersisted()
    if (p) {
      setTabs(p.tabs)
      setActiveRecordId(p.activeRecordId)
    }
    setHydrated(true)
  }, [])

  // Persist on every change once hydrated
  useEffect(() => {
    if (!hydrated) return
    savePersisted({ tabs, activeRecordId })
  }, [tabs, activeRecordId, hydrated])

  const openWorkspace = useCallback<Ctx['openWorkspace']>(({ recordId, title }) => {
    setTabs(prev => {
      const existing = prev.find(t => t.recordId === recordId)
      if (existing) {
        if (title && existing.title !== title) {
          return prev.map(t => t.recordId === recordId ? { ...t, title } : t)
        }
        return prev
      }
      const next: WorkspaceTab = {
        recordId,
        title: title ?? 'Loading…',
      }
      const trimmed = prev.length >= MAX_OPEN_WORKSPACES
        ? prev.slice(prev.length - (MAX_OPEN_WORKSPACES - 1))
        : prev
      return [...trimmed, next]
    })
    setActiveRecordId(recordId)
    // Track in recents (deduped + MRU inside pushRecentItem)
    if (title) {
      pushRecentItem({ kind: 'record', id: recordId, title, iconName: 'FileText' })
    }
  }, [])

  const closeWorkspace = useCallback<Ctx['closeWorkspace']>((recordId) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.recordId === recordId)
      if (idx < 0) return prev
      const next = prev.filter(t => t.recordId !== recordId)
      // If closing the active tab, fall back to the one before it (or after if none before)
      if (activeRecordId === recordId) {
        const fallback = next[Math.max(0, idx - 1)] ?? next[0] ?? null
        setActiveRecordId(fallback?.recordId ?? null)
      }
      return next
    })
  }, [activeRecordId])

  const closeAll = useCallback<Ctx['closeAll']>(() => {
    setTabs([])
    setActiveRecordId(null)
  }, [])

  const activateWorkspace = useCallback<Ctx['activateWorkspace']>((recordId) => {
    setActiveRecordId(recordId)
  }, [])

  const isOpen = activeRecordId !== null

  const ctxValue = useMemo<Ctx>(() => ({
    tabs,
    activeRecordId,
    isOpen,
    openWorkspace,
    closeWorkspace,
    closeAll,
    activateWorkspace,
  }), [tabs, activeRecordId, isOpen, openWorkspace, closeWorkspace, closeAll, activateWorkspace])

  return (
    <WorkspaceTabsContext.Provider value={ctxValue}>
      {children}
    </WorkspaceTabsContext.Provider>
  )
}

export function useWorkspaceTabs(): Ctx {
  const ctx = useContext(WorkspaceTabsContext)
  if (!ctx) throw new Error('useWorkspaceTabs must be used inside WorkspaceTabsProvider')
  return ctx
}
