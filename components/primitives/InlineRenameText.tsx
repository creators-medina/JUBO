'use client'

// ─────────────────────────────────────────────────────────────────────────
// InlineRenameText — reusable inline rename for titles/names (boards, groups,
// records). Double-click and/or right-click (two-finger click) swaps the text
// for an input; Enter/blur saves, Escape cancels, empty input never saves.
// Display is optimistic after a successful save (the new name shows until the
// `value` prop catches up via refresh), and a failed save keeps the editor
// open with an error ring so nothing is silently lost. The context menu is
// prevented ONLY on this element — never globally — and every pointer event
// inside the editor stops propagation so renaming can live inside draggable /
// clickable surfaces (sidebar links, Kanban cards, table rows) without
// triggering drag, navigation, or open-card behavior.
// ─────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InlineRenameText({
  value,
  onSave,
  className,
  inputClassName,
  doubleClick = true,
  contextMenu = true,
  onEditingChange,
  renameTitle,
  defaultEditing,
  pencil,
}: {
  value: string
  /** Persist the trimmed new name. Throw/reject to signal failure (editor stays open). */
  onSave: (next: string) => Promise<void> | void
  className?: string
  inputClassName?: string
  /** Enable double-click-to-rename (disable where a single click already acts). */
  doubleClick?: boolean
  /** Enable right-click / two-finger-click-to-rename. */
  contextMenu?: boolean
  /** Fires when editing starts/stops — lets hosts pause drag/navigation. */
  onEditingChange?: (editing: boolean) => void
  /** Tooltip override; defaults to the enabled trigger(s). */
  renameTitle?: string
  /** Mount straight into edit mode (host-triggered rename, e.g. Kanban cards). */
  defaultEditing?: boolean
  /** Show a small pencil button beside the text — a discoverable click-to-rename
   *  affordance in addition to double/right-click. */
  pencil?: boolean
}) {
  const [editing, setEditing] = useState(!!defaultEditing)
  const [draft, setDraft] = useState(defaultEditing ? value : '')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  // Optimistic display: after a successful save, show the new name until the
  // `value` prop changes (router.refresh / parent state catching up).
  const [optimistic, setOptimistic] = useState<{ base: string; shown: string } | null>(null)
  if (optimistic && optimistic.base !== value) setOptimistic(null)
  const display = optimistic?.shown ?? value

  const begin = (e: React.SyntheticEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDraft(display)
    setFailed(false)
    setEditing(true)
    onEditingChange?.(true)
  }
  const end = () => {
    setEditing(false)
    setFailed(false)
    onEditingChange?.(false)
  }
  const commit = async () => {
    if (pending) return
    const next = draft.trim()
    // Empty or unchanged → cancel, never save.
    if (!next || next === display) { end(); return }
    setPending(true)
    setFailed(false)
    try {
      await onSave(next)
      setOptimistic({ base: value, shown: next })
      end()
    } catch {
      setFailed(true) // keep the editor open so the draft isn't lost
    } finally {
      setPending(false)
    }
  }

  const tooltip = renameTitle ?? (
    doubleClick && contextMenu ? 'Double-click or right-click to rename'
      : doubleClick ? 'Double-click to rename'
        : 'Right-click to rename'
  )

  if (!editing) {
    const text = (
      <span
        className={cn('cursor-text rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-ring', className)}
        title={tooltip}
        onDoubleClick={doubleClick ? begin : undefined}
        onContextMenu={contextMenu ? begin : undefined}
      >
        {display}
      </span>
    )
    if (!pencil) return text
    return (
      <>
        {text}
        <button
          type="button"
          onClick={begin}
          title="Rename"
          aria-label={`Rename ${display}`}
          className="inline-flex flex-shrink-0 items-center rounded p-0.5 opacity-40 transition-opacity hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      </>
    )
  }

  return (
    <span
      className={cn('inline-flex min-w-0 items-center gap-1', className)}
      // Contain every interaction while editing so host click/drag/nav never fires.
      onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation() }}
      onContextMenu={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      draggable={false}
    >
      <input
        autoFocus
        value={draft}
        disabled={pending}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => { setDraft(e.target.value); if (failed) setFailed(false) }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          if (e.key === 'Escape') { e.preventDefault(); end() }
        }}
        onBlur={commit}
        aria-label="Rename"
        aria-invalid={failed || undefined}
        title={failed ? 'Save failed — try again or press Escape to cancel' : undefined}
        className={cn(
          'w-full min-w-0 rounded border bg-background px-1.5 py-0.5 text-inherit text-foreground focus:outline-none focus:ring-1',
          failed ? 'border-destructive focus:ring-destructive' : 'border-primary focus:ring-primary',
          pending && 'opacity-60',
          inputClassName,
        )}
      />
      {pending && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin text-muted-foreground" aria-hidden />}
    </span>
  )
}
