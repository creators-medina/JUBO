'use client'

// ─────────────────────────────────────────────────────────────────────────
// Stage Checklist editor (Phase 5K) — a focused, safe UI for managing the
// checklist items shown on ONE pipeline stage. Built entirely on existing
// data: checklist item = field_type='checklist' field; progress =
// field_values.value_boolean; stage scope = field_group_visibility. No schema
// change. Rename / reorder / remove-from-stage all preserve progress; only the
// explicitly-separated "Delete everywhere" is destructive (strong warning).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X, EyeOff, ListChecks } from 'lucide-react'
import {
  getStageChecklist, addStageChecklistItem, removeChecklistItemFromStage,
  reorderStageChecklist, updateField, deleteField, type StageChecklistItem,
} from '@/features/fields/actions'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  group: { id: string; name: string; role_label?: string | null; guidance_note?: string | null }
}

export function StageChecklistModal({ open, onClose, boardId, group }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addName, setAddName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // All state updates land AFTER the awaited fetch (never synchronously in the
  // effect) so opening the modal can't trigger a cascading render.
  const reload = useCallback(async () => {
    try {
      const { items } = await getStageChecklist(boardId, group.id)
      setItems(items); setError(null); setNotice(null); setConfirmDeleteId(null); setEditId(null); setLoading(false)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load checklist'); setLoading(false) }
  }, [boardId, group.id])

  useEffect(() => {
    if (!open) return
    let active = true
    void (async () => { if (active) await reload() })()
    return () => { active = false }
  }, [open, reload])

  const run = (fn: () => Promise<unknown>, fail: string, after?: () => void) => {
    setError(null); setNotice(null)
    startTransition(async () => {
      try { await fn(); await reload(); router.refresh(); after?.() }
      catch (e) { setError(e instanceof Error ? e.message : fail) }
    })
  }

  const onAdd = () => {
    const name = addName.trim()
    if (!name) return
    run(() => addStageChecklistItem(boardId, group.id, name), 'Could not add item', () => setAddName(''))
  }
  const onSaveRename = (id: string) => {
    const name = editDraft.trim()
    if (!name) { setEditId(null); return }
    run(() => updateField(id, { name }), 'Could not rename item', () => setEditId(null))
  }
  const onReorder = (index: number, dir: -1 | 1) => {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j], next[index]]
    setItems(next) // optimistic
    run(() => reorderStageChecklist(boardId, next.map((i) => i.id)), 'Could not reorder')
  }
  const onRemoveFromStage = (item: StageChecklistItem) => {
    run(async () => {
      const res = await removeChecklistItemFromStage(boardId, group.id, item.id)
      if (!res.removed) {
        if (res.reason === 'only-here') setNotice(`"${item.name}" is only on this stage. Use "Delete everywhere" to remove it, or add it to another stage first.`)
        else if (res.reason === 'single-stage-board') setNotice('This board has only one stage, so the item can’t be hidden from it. Delete it everywhere instead.')
      }
    }, 'Could not remove from stage')
  }
  const onDeleteEverywhere = (id: string) => {
    run(() => deleteField(id, boardId), 'Could not delete item', () => setConfirmDeleteId(null))
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Checklist · <span className="text-jubo-navy">{group.name}</span>
            {group.role_label && (
              <span className="inline-flex h-5 items-center rounded-full border border-border bg-surface-1 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.role_label}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <p className="mt-1 text-xs leading-snug text-muted-foreground">
          Checklist items here apply to this stage. Removing from this stage preserves progress;
          deleting everywhere permanently removes saved progress for every record.
        </p>

        {/* Guidance Note — stage context, shown separately; NOT a checklist item. */}
        {group.guidance_note && (
          <div className="mt-2 rounded-md border border-border bg-surface-1 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Guidance note</p>
            <p className="mt-0.5 text-xs italic leading-snug text-jubo-text-soft">{group.guidance_note}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">Edit via the stage menu → “Role &amp; guidance”. Not counted in checklist progress.</p>
          </div>
        )}

        {/* Item list */}
        <div className="mt-3 space-y-1.5">
          {loading ? (
            <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="rounded-md border border-dashed border-border py-4 text-center text-xs text-muted-foreground">No checklist items on this stage yet.</p>
          ) : (
            items.map((item, i) => (
              <div key={item.id} className="rounded-md border border-border bg-surface-1">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  {/* reorder */}
                  <div className="flex flex-col">
                    <button type="button" disabled={i === 0 || isPending} onClick={() => onReorder(i, -1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up"><ArrowUp className="h-3 w-3" /></button>
                    <button type="button" disabled={i === items.length - 1 || isPending} onClick={() => onReorder(i, 1)} className="text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down"><ArrowDown className="h-3 w-3" /></button>
                  </div>

                  {editId === item.id ? (
                    <div className="flex flex-1 items-center gap-1">
                      <input
                        autoFocus value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onSaveRename(item.id); if (e.key === 'Escape') setEditId(null) }}
                        className="flex-1 rounded border border-primary bg-card px-2 py-1 text-sm text-foreground focus:outline-none"
                      />
                      <button type="button" onClick={() => onSaveRename(item.id)} className="text-jubo-green hover:opacity-80" title="Save"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground" title="Cancel"><X className="h-4 w-4" /></button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 truncate text-sm text-foreground">{item.name}</span>
                      {item.isCommon && <span className="flex-shrink-0 text-[10px] text-muted-foreground" title="Shows on every stage">all stages</span>}
                      {item.completedCount > 0 && <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground" title="Records with this item completed">{item.completedCount} done</span>}
                      <button type="button" onClick={() => { setEditId(item.id); setEditDraft(item.name) }} className="flex-shrink-0 text-muted-foreground hover:text-foreground" title="Rename"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => onRemoveFromStage(item)} disabled={isPending} className="flex-shrink-0 text-muted-foreground hover:text-foreground" title="Remove from this stage (keeps progress)"><EyeOff className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => setConfirmDeleteId(item.id)} className="flex-shrink-0 text-destructive/70 hover:text-destructive" title="Delete everywhere (deletes progress)"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>

                {/* Destructive confirm — visually separated, red, requires explicit click */}
                {confirmDeleteId === item.id && (
                  <div className="border-t border-destructive/30 bg-destructive/5 px-3 py-2">
                    <p className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      This will permanently delete this checklist item and all saved progress for every record
                      {item.completedCount > 0 ? ` (${item.completedCount} record${item.completedCount === 1 ? '' : 's'} completed it).` : '.'}
                    </p>
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      <button type="button" onClick={() => onDeleteEverywhere(item.id)} disabled={isPending} className="rounded-md bg-destructive px-2 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">Delete everywhere</button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add item */}
        <div className="mt-3 flex items-center gap-2">
          <input
            value={addName} onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onAdd() }}
            placeholder="New checklist item…"
            className="flex-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <Button type="button" size="sm" onClick={onAdd} disabled={isPending || !addName.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" />Add
          </Button>
        </div>

        {notice && <p className={cn('mt-2 rounded-md border border-border bg-surface-1 px-3 py-2 text-xs text-jubo-text-soft')}>{notice}</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
