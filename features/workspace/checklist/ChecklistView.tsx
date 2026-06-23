'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CheckSquare, Square, Loader2 } from 'lucide-react'
import { getGroupChecklistFields } from '@/features/fields/actions'
import { upsertFieldValue } from '@/features/records/actions'
import { cn } from '@/lib/utils'

type FieldValue = { field_id: string; value_boolean?: boolean | null }

interface Props {
  recordId: string
  boardId: string
  groupId: string | null
  fieldValues: FieldValue[]
  onChanged?: () => void
}

/**
 * Phase 35E.1 — interactive checklist for the record's group. Items are the
 * checklist fields (field_type='checklist') visible in the group; each checkbox
 * toggles the SAME field_values row the board grid uses, so both views stay in
 * sync. Completion = checked / total.
 */
export function ChecklistView({ recordId, boardId, groupId, fieldValues, onChanged }: Props) {
  const [checklistFields, setChecklistFields] = useState<{ id: string; name: string }[] | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    setChecklistFields(null)
    getGroupChecklistFields(boardId, groupId)
      .then((r) => { if (active) setChecklistFields(r.fields) })
      .catch(() => { if (active) setChecklistFields([]) })
    return () => { active = false }
  }, [boardId, groupId])

  const checkedByField = useMemo(() => {
    const m = new Map<string, boolean>()
    for (const fv of fieldValues) m.set(fv.field_id, fv.value_boolean === true)
    return m
  }, [fieldValues])

  const items = useMemo(
    () => (checklistFields ?? []).map((f) => ({ field: f, complete: checkedByField.get(f.id) === true })),
    [checklistFields, checkedByField],
  )

  const totalCount = items.length
  const completedCount = items.filter((i) => i.complete).length
  const percentage = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100)

  const toggle = (fieldId: string, current: boolean) => {
    setPendingId(fieldId)
    startTransition(async () => {
      try {
        await upsertFieldValue(fieldId, recordId, boardId, { value_boolean: !current })
        onChanged?.()
      } finally {
        setPendingId(null)
      }
    })
  }

  if (checklistFields === null) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…
      </div>
    )
  }

  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <CheckSquare className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No checklist for this stage. Add a “Checklist item” field to this board to build one.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">{completedCount} / {totalCount} Complete</span>
          <span className={cn('text-xs font-semibold tabular-nums', percentage === 100 ? 'text-emerald-400' : 'text-muted-foreground')}>
            {percentage}%
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', percentage === 100 ? 'bg-emerald-500' : 'bg-primary')}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>

      {/* Interactive items */}
      <ul className="space-y-1">
        {items.map(({ field, complete }) => (
          <li key={field.id}>
            <button
              type="button"
              onClick={() => toggle(field.id, complete)}
              disabled={pendingId === field.id}
              className="flex w-full items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left hover:bg-surface-2 transition-colors disabled:opacity-60"
            >
              {pendingId === field.id ? (
                <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-muted-foreground" />
              ) : complete ? (
                <CheckSquare className="h-4 w-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <Square className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              )}
              <span className={cn('flex-1 text-xs', complete ? 'text-muted-foreground line-through' : 'text-foreground')}>
                {field.name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
