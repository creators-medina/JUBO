'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createRecord } from '@/features/records/actions'
import { createNote } from '@/features/workspace/notes/actions'
import { parseOptions } from '@/features/fields/status'
import type { BoardType } from '@/types/database'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  groupId: string
  organizationId: string
  /** Current-group-visible fields only (Phase 38C-3). */
  fields: any[]
  /** Field ids visible in EVERY group (no restriction OR explicitly all groups) —
   *  structurally common/client-level fields for Basic Info. */
  globalFieldIds?: Set<string>
  groupName?: string
  /** Phase 35A.3 — CRM boards read as contact intake (terminology + first note). */
  boardType?: BoardType
}

/**
 * Smart Add Record (Phase 38C-3) — "create, not complete".
 *
 * ONE form, three sections (no quick/full mode). Field source is the CURRENT
 * GROUP's visible fields (passed in), never all-board. Basic Info is resolved
 * structurally (title + default status + common_field_key_id + globally-visible
 * non-checklist fields) — no field-name/board-name checks. Checklist fields are
 * always collapsed; never required at creation. Viewport-bounded with a sticky
 * footer so Create is always reachable.
 */
export function CreateRecordModal({ open, onClose, boardId, groupId, organizationId, fields, globalFieldIds, groupName, boardType }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  // Phase 35A.3 — CRM boards are contact-centric. Same Smart Add Record intake,
  // contact terminology, plus an optional first note (reuses the notes system).
  const isContact = boardType === 'crm'
  const [notesDraft, setNotesDraft] = useState('')

  // ── Structural partition (no name/board-shape detection) ──
  const checklistFields = fields.filter((f) => f.field_type === 'checklist')
  const nonChecklist = fields.filter((f) => f.field_type !== 'checklist')
  const isBasic = (f: any) =>
    f.is_default_status || !!f.common_field_key_id || (globalFieldIds?.has(f.id) ?? false)
  const basicFields = nonChecklist
    .filter(isBasic)
    .sort((a, b) => (b.is_default_status ? 1 : 0) - (a.is_default_status ? 1 : 0) || (a.position ?? 0) - (b.position ?? 0))
  const stageFields = nonChecklist.filter((f) => !isBasic(f))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        const fieldValues = fields
          .filter((f) => fieldVals[f.id] !== undefined && fieldVals[f.id] !== '')
          .map((f) => {
            const raw = fieldVals[f.id]
            if (['number', 'currency'].includes(f.field_type)) return { field_id: f.id, value_number: parseFloat(raw) }
            if (f.field_type === 'boolean' || f.field_type === 'checklist') return { field_id: f.id, value_boolean: raw === 'true' }
            if (['date', 'datetime'].includes(f.field_type)) return { field_id: f.id, value_date: raw }
            return { field_id: f.id, value_text: raw }
          })
        const rec = await createRecord({ organization_id: organizationId, board_id: boardId, group_id: groupId, title: title.trim(), fieldValues })
        // Optional first note (contact intake) — reuses the existing notes RPC + activity log.
        if (isContact && notesDraft.trim() && rec?.id) {
          try { await createNote({ organization_id: organizationId, record_id: rec.id, content: notesDraft.trim() }) } catch { /* note is best-effort */ }
        }
        setTitle('')
        setFieldVals({})
        setNotesDraft('')
        onClose()
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  const renderInput = (field: any) => {
    const v = fieldVals[field.id] ?? ''
    const set = (val: string) => setFieldVals((prev) => ({ ...prev, [field.id]: val }))
    const cls = 'w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
    if (field.field_type === 'textarea') return <textarea value={v} onChange={(e) => set(e.target.value)} rows={2} className={`${cls} resize-none`} />
    if (field.field_type === 'boolean' || field.field_type === 'checklist') {
      return (
        <select value={v} onChange={(e) => set(e.target.value)} className={cls}>
          <option value="">—</option><option value="true">Yes</option><option value="false">No</option>
        </select>
      )
    }
    if (field.field_type === 'select' || field.field_type === 'status') {
      return (
        <select value={v} onChange={(e) => set(e.target.value)} className={cls}>
          <option value="">Select…</option>
          {parseOptions(field.config).map((opt) => <option key={opt.id ?? opt.label} value={opt.label}>{opt.label}</option>)}
        </select>
      )
    }
    const type = ['number', 'currency'].includes(field.field_type) ? 'number'
      : field.field_type === 'date' ? 'date'
      : field.field_type === 'email' ? 'email'
      : field.field_type === 'phone' ? 'tel' : 'text'
    return <input type={type} value={v} onChange={(e) => set(e.target.value)} className={cls} />
  }

  const FieldRow = ({ field }: { field: any }) => (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {field.name}{field.is_required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {renderInput(field)}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Sticky header */}
        <div className="flex-shrink-0 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{isContact ? 'Add contact' : 'Add record'}{groupName ? ` · ${groupName}` : ''}</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Basic Info — always expanded */}
            <div className="space-y-3 px-4 py-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">{isContact ? 'Name' : 'Title'}<span className="ml-0.5 text-destructive">*</span></label>
                <input
                  type="text" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus
                  placeholder={isContact ? 'Contact name' : 'Record title'}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              {basicFields.map((f) => <FieldRow key={f.id} field={f} />)}
              {isContact && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Notes</label>
                  <textarea
                    value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={2}
                    placeholder="First note — context, where they're at, next step…"
                    className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  />
                </div>
              )}
            </div>

            {/* Current Stage Fields — expanded only if a couple */}
            {stageFields.length > 0 && (
              <CollapsibleSection title="Current stage fields" defaultOpen={stageFields.length <= 2}>
                {stageFields.map((f) => <FieldRow key={f.id} field={f} />)}
              </CollapsibleSection>
            )}

            {/* Checklist for this stage — always collapsed; never required at creation */}
            {checklistFields.length > 0 && (
              <CollapsibleSection title="Checklist for this stage" count={checklistFields.length} defaultOpen={false}>
                {checklistFields.map((f) => <FieldRow key={f.id} field={f} />)}
              </CollapsibleSection>
            )}
          </div>

          {/* Sticky footer */}
          <div className="flex-shrink-0 border-t border-border px-4 py-3">
            {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button type="submit" size="sm" disabled={isPending || !title.trim()}>{isPending ? (isContact ? 'Adding…' : 'Creating…') : (isContact ? 'Add contact' : 'Create record')}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CollapsibleSection({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-foreground hover:bg-surface-1">
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span>{title}</span>
        {count != null && <span className="text-muted-foreground">· {count} item{count === 1 ? '' : 's'}</span>}
      </button>
      {open && <div className="space-y-3 px-4 pb-3">{children}</div>}
    </div>
  )
}
