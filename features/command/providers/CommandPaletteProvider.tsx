'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface Ctx {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandPaletteContext = createContext<Ctx | null>(null)

/**
 * Owns the open/close state for the global command palette. Listens for
 * Cmd/Ctrl+K at the window level so any page can summon it; ignores the
 * shortcut when the user is typing inside an input/textarea/contentEditable.
 */
export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)

  const open   = useCallback(() => setIsOpen(true), [])
  const close  = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(o => !o), [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (!isCmdK) return

      // Always allow Cmd+K even from inside inputs — that's the whole point.
      e.preventDefault()
      e.stopPropagation()
      setIsOpen(o => !o)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<Ctx>(() => ({ isOpen, open, close, toggle }), [isOpen, open, close, toggle])

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette(): Ctx {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) throw new Error('useCommandPalette must be used inside CommandPaletteProvider')
  return ctx
}
