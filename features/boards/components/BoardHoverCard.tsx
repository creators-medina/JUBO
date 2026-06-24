'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardHoverCard (Phase 10.7) — a lightweight borrower-intelligence preview for
// board TABLE rows. A condensed Command Center shown on hover/focus of a name,
// built ENTIRELY from data already on the row (no queries). Table view only —
// Kanban cards are themselves the drag source, so a hover panel there risks
// drag/drop conflicts (skipped this phase by design).
//
// useHoverCard manages an ~850ms open delay, a short close grace (so the pointer
// can travel to the panel), keyboard focus, Esc, scroll-to-close, and force-close
// while dragging. The panel is portaled to <body> and fixed-positioned so the
// table's overflow never clips it; pointerdown on the trigger closes it, so it
// never blocks the row's click-to-open or shows mid-drag.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckSquare, StickyNote, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

const OPEN_DELAY = 850
const CLOSE_DELAY = 260

type Rect = { left: number; top: number; bottom: number }

export function useHoverCard({ disabled }: { disabled?: boolean } = {}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<Rect | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // True briefly after a pointer interaction, so a tap/click-induced focus does
  // NOT open the panel (only genuine keyboard focus does) — touch-safe.
  const pointerRecent = useRef(false)
  const pointerClear = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = () => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }
  const close = useCallback(() => { clearTimers(); setOpen(false) }, [])
  const scheduleOpen = useCallback(() => {
    if (disabled) return
    clearTimers()
    openTimer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ left: r.left, top: r.top, bottom: r.bottom })
      setOpen(true)
    }, OPEN_DELAY)
  }, [disabled])
  const scheduleClose = useCallback(() => {
    if (openTimer.current) { clearTimeout(openTimer.current); openTimer.current = null }
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY)
  }, [])
  const cancelClose = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null }
  }, [])
  const onPointerDown = useCallback(() => {
    pointerRecent.current = true
    if (pointerClear.current) clearTimeout(pointerClear.current)
    pointerClear.current = setTimeout(() => { pointerRecent.current = false }, 500)
    close()
  }, [close])
  const onFocus = useCallback(() => { if (!pointerRecent.current) scheduleOpen() }, [scheduleOpen])

  // Force-close while dragging / when disabled.
  useEffect(() => { if (disabled) close() }, [disabled, close])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onScroll = () => close()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll, true) }
  }, [open, close])

  useEffect(() => () => { clearTimers(); if (pointerClear.current) clearTimeout(pointerClear.current) }, [])

  return {
    ref,
    open,
    rect,
    close,
    triggerProps: {
      onMouseEnter: scheduleOpen,
      onMouseLeave: scheduleClose,
      onFocus, // keyboard focus opens; tap/click-induced focus is suppressed
      onBlur: scheduleClose,
      onPointerDown, // click/drag/tap dismisses → never blocks open, never shows mid-drag
      tabIndex: 0,
    },
    panelProps: { onMouseEnter: cancelClose, onMouseLeave: scheduleClose },
  }
}

// ── Preview data (row-only; collapses anything not present) ──────────────────
function rowValue(fields: any[], fvMap: Record<string, any>, slug: string): any {
  const f = fields.find((x) => x.slug === slug)
  if (!f) return null
  const v = fvMap[f.id]
  if (!v) return null
  return v.value_text ?? v.value_number ?? v.value_date ?? null
}

export function BorrowerPreviewPanel({
  rect, panelProps, record, fields, fieldValueMap, groups, notesCount,
}: {
  rect: Rect
  panelProps: { onMouseEnter: () => void; onMouseLeave: () => void }
  record: any
  fields: any[]
  fieldValueMap: Record<string, any>
  groups: any[]
  notesCount?: number | null
}) {
  if (typeof document === 'undefined') return null

  const W = 288
  const sorted = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const stageIdx = sorted.findIndex((g) => g.id === record.group_id)
  const stageName = stageIdx >= 0 ? sorted[stageIdx].name : null

  // Loan facts (already on the row).
  const amountNum = (() => { const f = fields.find((x) => x.slug === 'loan_amount'); const v = f ? fieldValueMap[f.id] : null; return typeof v?.value_number === 'number' ? v.value_number : null })()
  const amount = amountNum != null ? `$${amountNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null
  const purpose = rowValue(fields, fieldValueMap, 'loan_purpose')

  // Checklist (from row field values).
  const checklistFields = fields.filter((f) => f.field_type === 'checklist')
  const total = checklistFields.length
  const done = checklistFields.filter((f) => fieldValueMap[f.id]?.value_boolean === true).length
  const pct = total > 0 ? Math.round((done / total) * 100) : null

  // Next action.
  const na = record.next_action as string | null
  const due = record.next_action_due_at as string | null
  const doneNa = record.next_action_completed_at
  const nextDue = (() => {
    if (!due) return null
    const d = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
    return d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d}d`
  })()

  // Placement — below the trigger, flipped above if not enough room, clamped.
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8))
  const below = rect.bottom + 4
  const flipAbove = below + 240 > window.innerHeight
  const style: React.CSSProperties = flipAbove
    ? { left, bottom: window.innerHeight - rect.top + 4, width: W }
    : { left, top: below, width: W }

  return createPortal(
    <div
      {...panelProps}
      role="dialog"
      aria-label={`${record.title} preview`}
      className="jubo-los-scope fixed z-[100] rounded-xl border border-border bg-popover p-3 shadow-2xl"
      style={style}
    >
      {/* Stage / status at top */}
      {sorted.length >= 2 && (
        <div className="mb-2 flex items-center gap-2">
          <div className="flex items-center gap-1">
            {sorted.map((g, i) => (
              <span
                key={g.id}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i < stageIdx ? 'var(--accent-green)' : i === stageIdx ? 'var(--primary)' : 'var(--surface-3)' }}
                aria-hidden
              />
            ))}
          </div>
          {stageName && <span className="truncate text-2xs font-medium text-muted-foreground">{stageName} · {stageIdx + 1}/{sorted.length}</span>}
        </div>
      )}

      {/* Name */}
      <p className="truncate text-sm font-semibold text-foreground">{record.title || 'Untitled'}</p>

      {/* Loan amount · purpose */}
      {(amount || purpose) && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {amount && <span className="font-semibold" style={{ color: 'var(--accent-green)' }}>{amount}</span>}
          {amount && purpose ? ' · ' : ''}{purpose}
        </p>
      )}

      {/* Checklist + notes */}
      {(pct != null || (notesCount ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs text-muted-foreground">
          {pct != null && (
            <span className="inline-flex items-center gap-1">
              <CheckSquare className="h-3 w-3" style={{ color: total - done === 0 ? 'var(--accent-green)' : 'var(--accent-amber)' }} />
              {pct}% · {total - done} left
            </span>
          )}
          {(notesCount ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1"><StickyNote className="h-3 w-3" /> {notesCount} notes</span>
          )}
        </div>
      )}

      {/* Next action — prominent if present and not completed */}
      {na && !doneNa && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-surface-1/70 px-2 py-1.5">
          <Zap className="mt-0.5 h-3 w-3 flex-shrink-0" style={{ color: nextDue === 'overdue' ? 'var(--accent-rose)' : 'var(--primary)' }} />
          <div className="min-w-0">
            <p className="text-2xs font-medium text-foreground line-clamp-2">{na}</p>
            {nextDue && <p className={cn('text-2xs', nextDue === 'overdue' ? 'text-red-400' : 'text-muted-foreground')}>Due {nextDue}</p>}
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}
