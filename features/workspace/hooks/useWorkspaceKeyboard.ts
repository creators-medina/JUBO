'use client'

import { useEffect } from 'react'

interface Options {
  enabled: boolean
  onClose: () => void
}

/**
 * Foundational workspace keyboard shortcuts:
 *   esc            → close active workspace
 *
 * Skips when focus is inside an editable element (input, textarea, contentEditable)
 * so plain typing doesn't fire shortcuts. (The card's four tabs are managed
 * inside PersonFileCard, so there is no outer sub-tab cycling.)
 */
export function useWorkspaceKeyboard({ enabled, onClose }: Options) {
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
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onClose])
}
