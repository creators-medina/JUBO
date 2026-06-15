'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, X, Plus, Trash2, Loader2 } from 'lucide-react'
import { parseOptions } from '@/features/fields/status'
import { createStatusAutomation, deleteWorkflow, listBoardAutomations } from '../actions'
import { setWorkflowEnabled } from '../actions'
import type { WorkflowRow } from '../types'

type FieldLite = { id: string; name: string; slug: string; field_type: string; config?: unknown }
type GroupLite = { id: string; name: string }

/**
 * Minimal board-level "Status → move to group" automation manager (Phase 34B).
 * Lists existing automations and creates new ones from live status fields,
 * labels, and groups. Structured so Phase 34C can replace it with the full
 * Automation Center.
 */
export function AutomationsModal({
  open, onClose, board, organizationId, fields, groups,
}: {
  open: boolean
  onClose: () => void
  board: { id: string; name: string }
  organizationId: string
  fields: FieldLite[]
  groups: GroupLite[]
}) {
  const router = useRouter()
  const [items, setItems] = useState<WorkflowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Only status fields can drive these automations (Phase 34B scope).
  const statusFields = fields.filter((f) => f.field_type === 'status')

  const [fieldId, setFieldId] = useState('')
  const [toValue, setToValue] = useState('')
  const [groupId, setGroupId] = useState('')

  const selectedField = statusFields.find((f) => f.id === fieldId) ?? null
  const labels = selectedField ? parseOptions(selectedField.config) : []

  const refresh = () => { listBoardAutomations(board.id).then((rows) => { setItems(rows); setLoading(false) }).catch(() => setLoading(false)) }

  useEffect(() => {
    if (!open) return
    setLoading(true); setError(null)
    refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, board.id])

  useEffect(() => { setToValue('') }, [fieldId])

  if (!open) return null

  const create = () => {
    if (!selectedField || !toValue || !groupId) return
    const groupName = groups.find((g) => g.id === groupId)?.name ?? 'group'
    const title = `When ${selectedField.name} = ${toValue} → move to ${groupName}`
    setError(null)
    startTransition(async () => {
      try {
        await createStatusAutomation({
          organizationId, boardId: board.id,
          fieldId: selectedField.id, fieldSlug: selectedField.slug, toValue, groupId, title,
        })
        setFieldId(''); setToValue(''); setGroupId('')
        refresh(); router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create automation.')
      }
    })
  }

  const toggle = (wf: WorkflowRow) => {
    startTransition(async () => {
      try { await setWorkflowEnabled(wf.id, !wf.enabled); refresh(); router.refresh() }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not update.') }
    })
  }

  const remove = (wf: WorkflowRow) => {
    startTransition(async () => {
      try { await deleteWorkflow(wf.id, board.id); refresh(); router.refresh() }
      catch (e) { setError(e instanceof Error ? e.message : 'Could not delete.') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Zap className="h-4 w-4 text-primary" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-foreground">Automations · {board.name}</h2>
            <p className="text-2xs text-muted-foreground">When a status changes, move the item to a group.</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {error && <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        {/* Existing automations */}
        <div className="mb-4">
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">No automations yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((wf) => (
                <li key={wf.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2">
                  <span className={`flex-1 truncate text-xs ${wf.enabled ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{wf.title}</span>
                  <label className="flex items-center gap-1 text-2xs text-muted-foreground">
                    <input type="checkbox" checked={wf.enabled} disabled={pending} onChange={() => toggle(wf)} className="rounded border-border" />
                    {wf.enabled ? 'On' : 'Off'}
                  </label>
                  <button onClick={() => remove(wf)} disabled={pending} className="text-muted-foreground hover:text-red-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Create form */}
        <div className="rounded-lg border border-border bg-surface-1 p-3">
          {statusFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">This board has no Status columns yet. Add a Status field to create automations.</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>When</span>
                <select value={fieldId} onChange={(e) => setFieldId(e.target.value)} className={sel}>
                  <option value="">status field…</option>
                  {statusFields.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <span>changes to</span>
                <select value={toValue} onChange={(e) => setToValue(e.target.value)} disabled={!selectedField} className={sel}>
                  <option value="">label…</option>
                  {labels.map((o) => <option key={o.id ?? o.label} value={o.label}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>then move item to</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={sel}>
                  <option value="">group…</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={create}
                  disabled={pending || !fieldId || !toValue || !groupId}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add automation
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const sel = 'rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50'
