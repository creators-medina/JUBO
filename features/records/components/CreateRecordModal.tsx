'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createRecord } from '@/features/records/actions'

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  groupId: string
  organizationId: string
  fields: any[]
}

export function CreateRecordModal({ open, onClose, boardId, groupId, organizationId, fields }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      try {
        const fieldValues = fields
          .filter(f => fieldVals[f.id] !== undefined && fieldVals[f.id] !== '')
          .map(f => {
            const raw = fieldVals[f.id]
            if (['number', 'currency'].includes(f.field_type)) return { field_id: f.id, value_number: parseFloat(raw) }
            if (f.field_type === 'boolean') return { field_id: f.id, value_boolean: raw === 'true' }
            if (['date', 'datetime'].includes(f.field_type)) return { field_id: f.id, value_date: raw }
            return { field_id: f.id, value_text: raw }
          })
        await createRecord({ organization_id: organizationId, board_id: boardId, group_id: groupId, title: title.trim(), fieldValues })
        setTitle('')
        setFieldVals({})
        onClose()
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">New record</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Record title"
              required
              autoFocus
            />
          </div>
          {fields.map(field => (
            <div key={field.id} className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {field.name}{field.is_required && <span className="text-destructive ml-0.5">*</span>}
              </label>
              {field.field_type === 'textarea' ? (
                <textarea
                  value={fieldVals[field.id] ?? ''}
                  onChange={e => setFieldVals(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={2}
                />
              ) : field.field_type === 'boolean' ? (
                <select
                  value={fieldVals[field.id] ?? ''}
                  onChange={e => setFieldVals(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              ) : field.field_type === 'select' ? (
                <select
                  value={fieldVals[field.id] ?? ''}
                  onChange={e => setFieldVals(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">Select…</option>
                  {(field.config?.options ?? []).map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={
                    ['number', 'currency'].includes(field.field_type) ? 'number' :
                    field.field_type === 'date' ? 'date' :
                    field.field_type === 'email' ? 'email' :
                    field.field_type === 'phone' ? 'tel' : 'text'
                  }
                  value={fieldVals[field.id] ?? ''}
                  onChange={e => setFieldVals(v => ({ ...v, [field.id]: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !title.trim()}>
              {isPending ? 'Creating…' : 'Create record'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
