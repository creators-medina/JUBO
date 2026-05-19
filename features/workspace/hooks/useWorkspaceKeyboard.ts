'use client'

import { useEffect } from 'react'

interface Options {
  enabled: boolean
  onClose: () => void
  onCycle: (direction: 1 | -1) => void
}

/**
 * Foundational workspace keyboard shortcuts:
 *   esc            → close active workspace
 *   ⌘⇧]            → next sub-tab
 *   ⌘⇧[            → previous sub-tab
 *
 * Skips when focus is inside an editable element (input, textarea, contentEditable)
 * so plain typing — including the `/` and `[`/`]` characters — doesn't fire shortcuts.
 */
export function useWorkspaceKeyboard({ enabled, onClose, onCycle }: Options) {
  useEffect(() => {
    if (!enabled) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      const editable =
        tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable

      if (e.key === 'Escape' && !editable) {
        e.preventDefault()
        onClose()
        return
      }

      const cmd = e.metaKey || e.ctrlKey
      if (cmd && e.shiftKey) {
        if (e.key === ']') { e.preventDefault(); onCycle(1); return }
        if (e.key === '[') { e.preventDefault(); onCycle(-1); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onClose, onCycle])
}
