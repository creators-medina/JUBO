'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { Loader2, Check, Plus, Pencil, X, Trash2 } from 'lucide-react'
import { upsertFieldValue } from '@/features/records/actions'
import { updateFieldOptions, renameStatusOption } from '@/features/fields/actions'
import {
  parseOptions, isColoredStatus, nextStatusColor, newOptionId, STATUS_PALETTE, STATUS_EMPTY_COLOR,
  type StatusOption,
} from '@/features/fields/status'
import { cn } from '@/lib/utils'

interface Props {
  field: any
  fieldValue: any | null
  recordId: string
  boardId: string
}

/**
 * Monday-style status/select cell. Empty status cells render a neutral gray
 * block; selected values render a colored label. Clicking opens a picker; an
 * "Edit labels" mode supports rename (cascades stored values), recolor, add,
 * and delete. Writes go through fields.config.options + the rename RPC.
 */
export function StatusCell({ field, fieldValue, recordId, boardId }: Props) {
  const router = useRouter()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'pick' | 'edit'>('pick')
  const [pos, setPos] = useState<{ openUp: boolean; top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const isStatus = field.field_type === 'status'
  const options = parseOptions(field.config)
  const colored = isColoredStatus(options) || isStatus
  const currentLabel = fieldValue?.value_text ?? ''
  const currentOpt = options.find((o) => o.label === currentLabel)

  // Phase 38D-2 — collision-aware placement. Portal + position:fixed already
  // escapes parent overflow; this adds vertical flip + height/left clamping so a
  // dropdown near the bottom (or right) edge stays fully on-screen. Recomputed on
  // scroll/resize (capture=true catches the table container's own scroll).
  useEffect(() => {
    if (!open) return
    const compute = () => {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const margin = 8
      const vh = window.innerHeight
      const vw = window.innerWidth
      const spaceBelow = vh - r.bottom - margin
      const spaceAbove = r.top - margin
      const openUp = spaceBelow < 240 && spaceAbove > spaceBelow
      const maxHeight = Math.max(160, Math.min(360, openUp ? spaceAbove : spaceBelow))
      const minWidth = Math.max(220, r.width)
      let left = r.left
      if (left + minWidth > vw - margin) left = Math.max(margin, vw - margin - minWidth)
      setPos(openUp
        ? { openUp, bottom: vh - r.top + 4, left, minWidth, maxHeight }
        : { openUp, top: r.bottom + 4, left, minWidth, maxHeight })
    }
    compute()
    window.addEventListener('resize', compute)
    window.addEventListener('scroll', compute, true)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-status-popover]') && !triggerRef.current?.contains(e.target as Node)) {
        close()
      }
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const close = () => { setOpen(false); setMode('pick'); setAdding(false); setDraft('') }

  const pick = async (label: string) => {
    close()
    if (label === currentLabel) return
    setSaving(true)
    try { await upsertFieldValue(field.id, recordId, boardId, { value_text: label || null }) }
    finally { setSaving(false) }
  }

  const clear = async () => {
    close()
    setSaving(true)
    try { await upsertFieldValue(field.id, recordId, boardId, { value_text: null }) }
    finally { setSaving(false) }
  }

  const addOption = async () => {
    const label = draft.trim()
    if (!label) return
    const existing = options.find((o) => o.label.toLowerCase() === label.toLowerCase())
    if (existing) { await pick(existing.label); return }
    const next: StatusOption[] = [...options, { id: newOptionId(), label, color: nextStatusColor(options) }]
    setSaving(true)
    try {
      await updateFieldOptions(field.id, next)
      if (mode === 'pick') await upsertFieldValue(field.id, recordId, boardId, { value_text: label })
      setAdding(false); setDraft('')
      if (mode === 'pick') close()
      router.refresh()
    } finally { setSaving(false) }
  }

  // Ensure every option has a stable id before editing (backfill legacy options).
  const withIds = (opts: StatusOption[]) => opts.map((o) => (o.id ? o : { ...o, id: newOptionId() }))

  const persist = async (next: StatusOption[]) => {
    setSaving(true)
    try { await updateFieldOptions(field.id, next); router.refresh() }
    finally { setSaving(false) }
  }

  const recolor = async (id: string) => {
    const opts = withIds(options)
    const next = opts.map((o) => {
      if (o.id !== id) return o
      const idx = STATUS_PALETTE.indexOf((o.color ?? '') as typeof STATUS_PALETTE[number])
      const color = STATUS_PALETTE[(idx + 1 + STATUS_PALETTE.length) % STATUS_PALETTE.length]
      return { ...o, color }
    })
    await persist(next)
  }

  const removeOption = async (id: string) => {
    // Deleting a label leaves existing record values intact (they render plain).
    await persist(withIds(options).filter((o) => o.id !== id))
  }

  const rename = async (id: string, label: string) => {
    const trimmed = label.trim()
    const target = options.find((o) => o.id === id)
    if (!trimmed || !target || target.label === trimmed) return
    setSaving(true)
    try {
      // Backfill ids first if this option had none (legacy), so rename targets by id.
      if (!target.id) { await updateFieldOptions(field.id, withIds(options)) }
      await renameStatusOption(field.id, id, trimmed)
      router.refresh()
    } finally { setSaving(false) }
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        disabled={saving}
        className={cn('inline-flex items-center gap-1 max-w-full rounded-md transition-opacity', saving && 'opacity-60')}
      >
        {currentLabel ? (
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium truncate"
            style={{
              backgroundColor: currentOpt?.color ?? (colored ? STATUS_EMPTY_COLOR : 'transparent'),
              border: !colored ? '1px solid var(--border)' : undefined,
              color: colored ? '#fff' : 'var(--foreground)',
            }}
          >
            {currentLabel}
          </span>
        ) : isStatus ? (
          // Monday-style empty: a neutral gray block.
          <span className="inline-flex items-center px-3 py-0.5 rounded text-2xs font-medium text-white/70" style={{ backgroundColor: STATUS_EMPTY_COLOR }}>
            —
          </span>
        ) : (
          <span className="text-2xs text-muted-foreground">—</span>
        )}
        {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </button>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          data-status-popover
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.minWidth, maxHeight: pos.maxHeight }}
          className="z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
        >
          {mode === 'pick' ? (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {options.length === 0 && !adding && (
                  <p className="px-3 py-2 text-2xs text-muted-foreground">No labels yet — add one below.</p>
                )}
                {options.map((o) => (
                  <button key={o.id ?? o.label} onClick={() => pick(o.label)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-1">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm border border-border" style={{ backgroundColor: o.color ?? 'transparent' }} />
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
              <div className="flex flex-shrink-0 items-center gap-1 border-t border-border p-2">
                {adding ? (
                  <div className="flex flex-1 items-center gap-1.5">
                    <input
                      autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                      placeholder="New label…" className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <button onClick={addOption} disabled={!draft.trim()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">Add</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => setAdding(true)} className="flex flex-1 items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                      <Plus className="h-3 w-3" /> Add label
                    </button>
                    <button onClick={() => setMode('edit')} className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-2">
                <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Edit labels</span>
                <button onClick={() => setMode('pick')} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                {withIds(options).map((o) => (
                  <div key={o.id} className="flex items-center gap-2 px-2 py-1">
                    <button onClick={() => recolor(o.id!)} title="Recolor" className="h-4 w-4 flex-shrink-0 rounded-sm border border-border" style={{ backgroundColor: o.color ?? 'transparent' }} />
                    <input
                      defaultValue={o.label}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rename(o.id!, (e.target as HTMLInputElement).value) } }}
                      onBlur={(e) => rename(o.id!, e.target.value)}
                      className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-foreground hover:border-border focus:border-primary focus:bg-surface-1 focus:outline-none"
                    />
                    <button onClick={() => removeOption(o.id!)} title="Delete label" className="text-muted-foreground hover:text-red-300"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 border-t border-border p-2">
                {adding ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption() } if (e.key === 'Escape') { setAdding(false); setDraft('') } }}
                      placeholder="New label…" className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-xs text-foreground focus:border-primary focus:outline-none"
                    />
                    <button onClick={addOption} disabled={!draft.trim()} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50">Add</button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-surface-1 hover:text-foreground">
                    <Plus className="h-3 w-3" /> Add label
                  </button>
                )}
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}
