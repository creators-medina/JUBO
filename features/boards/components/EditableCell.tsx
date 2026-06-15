'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { upsertFieldValue } from '@/features/records/actions'
import { StatusCell } from './StatusCell'
import { ChecklistCell } from './ChecklistCell'
import { cn } from '@/lib/utils'

interface Props {
  field: any
  fieldValue: any | null
  recordId: string
  boardId: string
}

export function EditableCell({ field, fieldValue, recordId, boardId }: Props) {
  const ft = field.field_type
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)

  // Current display value
  const currentValue = (() => {
    if (!fieldValue) return ''
    if (fieldValue.value_text != null) return fieldValue.value_text
    if (fieldValue.value_number != null) return String(fieldValue.value_number)
    if (fieldValue.value_boolean != null) return fieldValue.value_boolean ? 'true' : 'false'
    if (fieldValue.value_date != null) return fieldValue.value_date.split('T')[0]
    return ''
  })()

  const [draft, setDraft] = useState(currentValue)
  useEffect(() => { setDraft(currentValue) }, [currentValue])

  const save = async (val: string) => {
    setSaving(true)
    setEditing(false)
    try {
      let payload: object = {}
      if (ft === 'number' || ft === 'currency') payload = { value_number: val ? parseFloat(val) : null }
      else if (ft === 'boolean') payload = { value_boolean: val === '' ? null : val === 'true' }
      else if (ft === 'date' || ft === 'datetime') payload = { value_date: val ? new Date(val).toISOString() : null }
      else payload = { value_text: val || null }

      await upsertFieldValue(field.id, recordId, boardId, payload)
    } finally {
      setSaving(false)
    }
  }

  // Checklist field — single-click checkbox (Phase 35E.1).
  if (ft === 'checklist') {
    return <ChecklistCell field={field} fieldValue={fieldValue} recordId={recordId} boardId={boardId} />
  }

  // Non-editable inline: boolean and select use immediate onChange
  if (ft === 'boolean') {
    return (
      <div className="flex items-center gap-1">
        <select
          value={draft}
          onChange={async e => { setDraft(e.target.value); await save(e.target.value) }}
          disabled={saving}
          className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
        {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      </div>
    )
  }

  if (ft === 'select' || ft === 'status') {
    return <StatusCell field={field} fieldValue={fieldValue} recordId={recordId} boardId={boardId} />
  }

  // Click-to-edit for text, number, currency, date
  if (['text', 'textarea', 'number', 'currency', 'email', 'phone', 'url', 'date'].includes(ft)) {
    if (editing) {
      return (
        <input
          autoFocus
          type={ft === 'number' || ft === 'currency' ? 'number' : ft === 'date' ? 'date' : ft === 'email' ? 'email' : ft === 'phone' ? 'tel' : 'text'}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => save(draft)}
          onKeyDown={e => { if (e.key === 'Enter') save(draft); if (e.key === 'Escape') { setDraft(currentValue); setEditing(false) } }}
          className="w-full bg-surface-1 border border-primary rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none"
        />
      )
    }

    return (
      <div
        onClick={() => setEditing(true)}
        className={cn('flex items-center gap-1 cursor-pointer min-h-[20px] rounded px-1 -mx-1 hover:bg-surface-2 transition-colors group/cell', saving && 'opacity-50')}
      >
        {saving ? (
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={cn('text-xs truncate max-w-[160px]', !currentValue && 'text-muted-foreground')}>
            {ft === 'currency' && currentValue ? `$${Number(currentValue).toLocaleString()}` : (currentValue || '—')}
          </span>
        )}
      </div>
    )
  }

  // Fallback — non-editable inline
  return <span className="text-xs text-muted-foreground truncate">{currentValue || '—'}</span>
}
