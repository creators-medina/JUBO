'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { createField } from '@/features/fields/actions'
import type { FieldType } from '@/types/database'

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
]

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
}

interface Props {
  open: boolean
  onClose: () => void
  boardId: string
  organizationId: string
  nextPosition: number
}

export function CreateFieldModal({ open, onClose, boardId, organizationId, nextPosition }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [fieldType, setFieldType] = useState<FieldType>('text')
  const [isRequired, setIsRequired] = useState(false)
  const [selectOptions, setSelectOptions] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const config: Record<string, unknown> = {}
    if ((fieldType === 'select' || fieldType === 'multiselect') && selectOptions) {
      config.options = selectOptions.split(',').map(s => s.trim()).filter(Boolean)
    }
    startTransition(async () => {
      try {
        await createField({
          organization_id: organizationId,
          board_id: boardId,
          name: name.trim(),
          slug: slugify(name),
          field_type: fieldType,
          is_required: isRequired,
          position: nextPosition,
          config,
        })
        setName('')
        setFieldType('text')
        setSelectOptions('')
        onClose()
        router.refresh()
      } catch (err: any) {
        setError(err.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-foreground">Add field</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Field name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="e.g. Loan Amount"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Type</label>
            <select
              value={fieldType}
              onChange={e => setFieldType(e.target.value as FieldType)}
              className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {FIELD_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {(fieldType === 'select' || fieldType === 'multiselect') && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Options <span className="text-muted-foreground">(comma-separated)</span>
              </label>
              <input
                type="text"
                value={selectOptions}
                onChange={e => setSelectOptions(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Option A, Option B, Option C"
              />
            </div>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={e => setIsRequired(e.target.checked)}
              className="rounded"
            />
            <span className="text-xs text-foreground">Required field</span>
          </label>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
              {isPending ? 'Adding…' : 'Add field'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
