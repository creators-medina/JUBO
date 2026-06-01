'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Check, Plus } from 'lucide-react'
import { upsertFieldValue } from '@/features/records/actions'
import { updateFieldOptions } from '@/features/fields/actions'
import { parseOptions, isColoredStatus, nextStatusColor, STATUS_PALETTE, type StatusOption } from '@/features/fields/status'
import { cn } from '@/lib/utils'

interface Props {
  field: any
  fieldValue: any | null
  recordId: string
  boardId: string
}

/**
 * Status/select cell. Renders the current value as a colored pill (status) or
 * plain pill (select). Clicking opens a portal-rendered picker with all options
 * and an inline "Add option" affordance — so a user can populate options without
 * a separate config modal. Adding writes back into fields.config.options.
 */
export function StatusCell({ field, fieldValue, recordId, boardId }: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const options = parseOptions(field.config)
  const colored = isColoredStatus(options)
  const currentLabel = fieldValue?.value_text ?? ''
  const currentOpt = options.find((o) => o.label === currentLabel)

  // Position the popover beneath the trigger, anchored to viewport.
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left, minWidth: Math.max(180, r.width) })
  }, [open])

  // Outside-click + Escape to close.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-status-popover]') && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false); setAdding(false); setDraft('')
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setAdding(false); setDraft('') } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = async (label: string) => {
    setOpen(false); setAdding(false); setDraft('')
    if (label === currentLabel) return
    setSaving(true)
    try {
      await upsertFieldValue(field.id, recordId, boardId, { value_text: label || null })
    } finally { setSaving(false) }
  }

  const clear = async () => {
    setOpen(false)
    setSaving(true)
    try { await upsertFieldValue(field.id, recordId, boardId, { value_text: null }) }
    finally { setSaving(false) }
  }

  const addOption = async () => {
    const label = draft.trim()
    if (!label) return
    if (options.some((o) => o.label.toLowerCase() === label.toLowerCase())) {
      // already exists — just pick it
      await pick(options.find((o) => o.label.toLowerCase() === label.toLowerCase())!.label)
      return
    }
    const next: StatusOption[] = [...options, { label, color: nextStatusColor(options) }]
    setSaving(true)
    try {
      await updateFieldOptions(field.id, next)
      await upsertFieldValue(field.id, recordId, boardId, { value_text: label })
    } finally {
      setSaving(false); setOpen(false); setAdding(false); setDraft('')
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={saving}
        className={cn(
          'inline-flex items-center gap-1 max-w-full rounded-md transition-opacity',
          saving && 'opacity-60',
        )}
      >
        {currentLabel ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium text-white truncate"
            style={{ backgroundColor: currentOpt?.color ?? (colored ? '#64748b' : 'transparent'), border: !colored ? '1px solid var(--border)' : undefined, color: colored ? '#fff' : 'var(--foreground)' }}
          >
            {currentLabel}
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        )}
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          data-status-popover
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.minWidth }}
          className="z-50 rounded-lg border border-border bg-card shadow-xl"
        >
          <div className="max-h-60 overflow-y-auto py-1">
            {options.length === 0 && !adding && (
              <p className="px-3 py-2 text-2xs text-muted-foreground">No options yet — add one below.</p>
            )}
            {options.map((o) => (
              <button
                key={o.label}
                onClick={() => pick(o.label)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-1"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
                  style={{ backgroundColor: o.color ?? 'transparent' }}
                />
                <span className="flex-1 truncate text-xs text-foreground">{o.label}</span>
                {o.label === currentLabel && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
            {currentLabel && (
              <button onClick={clear} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                Clear value
              </button>
            )}
          </div>
          <div className="border-t border-border p-2">
            {adding ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addOption() }
                    if (e.key === 'Escape') { setAdding(false); setDraft('') }
                  }}
                  placeholder="New option…"
                  className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                />
                <button onClick={addOption} disabled={!draft.trim()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">Add</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                <Plus className="h-3 w-3" /> Add option
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
