'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square, Loader2 } from 'lucide-react'
import { getGroupChecklist } from '@/features/fields/actions'
import { isValueComplete, type FieldValueLike } from '@/features/fields/checklist'
import { cn } from '@/lib/utils'

type FieldLite = { id: string; name: string; field_type: string }
type FieldValue = { field_id: string } & FieldValueLike

interface Props {
  boardId: string
  groupId: string | null
  fields: FieldLite[]
  fieldValues: FieldValue[]
}

/**
 * Phase 35E — the record's checklist for its current group. The requirement set
 * (fields required AND visible in the group) is fetched once; completion is
 * computed live from the record's field values, so it updates immediately as
 * values change. Nothing is manually entered — items derive from required fields.
 */
export function ChecklistView({ boardId, groupId, fields, fieldValues }: Props) {
  const [requiredFieldIds, setRequiredFieldIds] = useState<string[] | null>(null)

  useEffect(() => {
    let active = true
    setRequiredFieldIds(null)
    getGroupChecklist(boardId, groupId)
      .then((r) => { if (active) setRequiredFieldIds(r.requiredFieldIds) })
      .catch(() => { if (active) setRequiredFieldIds([]) })
    return () => { active = false }
  }, [boardId, groupId])

  const valueByField = useMemo(() => {
    const m = new Map<string, FieldValueLike>()
    for (const fv of fieldValues) m.set(fv.field_id, fv)
    return m
  }, [fieldValues])

  const items = useMemo(() => {
    if (!requiredFieldIds) return []
    const ids = new Set(requiredFieldIds)
    return fields
      .filter((f) => ids.has(f.id))
      .map((f) => ({ field: f, complete: isValueComplete(f.field_type, valueByField.get(f.id)) }))
  }, [requiredFieldIds, fields, valueByField])

  const requiredCount = items.length
  const completedCount = items.filter((i) => i.complete).length
  const percentage = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100)

  if (requiredFieldIds === null) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading checklist…
      </div>
    )
  }

  if (requiredCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <CheckSquare className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          No checklist for this stage. Mark fields as required for this group from a column’s menu to build one.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Progress summary */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-foreground">
            {completedCount} / {requiredCount} Complete
          </span>
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

      {/* Items */}
      <ul className="space-y-1">
        {items.map(({ field, complete }) => (
          <li
            key={field.id}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-surface-1 px-3 py-2"
          >
            {complete ? (
              <CheckSquare className="h-4 w-4 flex-shrink-0 text-emerald-400" />
            ) : (
              <Square className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            )}
            <span className={cn('flex-1 text-xs', complete ? 'text-foreground' : 'text-muted-foreground')}>
              {field.name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
