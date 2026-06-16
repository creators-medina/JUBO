'use client'

// ─────────────────────────────────────────────────────────────────────────
// Shared Kanban card FACE (Phase 37B-2E) — the visual content of a Kanban card,
// rendered by BOTH the real draggable card and the DragOverlay so the dragged
// preview looks exactly like the card lifted off the board. Presentation only.
// ─────────────────────────────────────────────────────────────────────────

import { CheckSquare, User } from 'lucide-react'
import { parseOptions } from '@/features/fields/status'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { cn } from '@/lib/utils'

const STATUS_EMPTY = '#64748b'
const COMMON_PRIORITY: Record<string, number> = { email: 0, phone: 1, currency: 2 }

export function formatCellValue(field: any, fv: any): string {
  if (!fv) return ''
  switch (field.field_type) {
    case 'currency': return fv.value_number != null ? `$${Number(fv.value_number).toLocaleString()}` : ''
    case 'number': case 'rating': return fv.value_number != null ? String(fv.value_number) : ''
    case 'boolean': case 'checklist': return fv.value_boolean === true ? 'Yes' : fv.value_boolean === false ? 'No' : ''
    case 'date': case 'datetime': return fv.value_date ? fv.value_date.split('T')[0] : (fv.value_text ?? '')
    case 'multiselect': case 'tags': return Array.isArray(fv.value_json) ? fv.value_json.join(', ') : (fv.value_text ?? '')
    default: return fv.value_text ?? ''
  }
}

export type KanbanFace = {
  title: string
  statusLabel: string
  statusColor: string
  common: { name: string; value: string }[]
  hasOwner: boolean
  checklist: { completedCount: number; totalCount: number; percentage: number; hasChecklist: boolean }
}

/** Build the face data for a record — single source of truth for card + overlay. */
export function buildKanbanFace(opts: {
  record: any
  groupFields: any[]
  fvMap: Record<string, any>
  allFields: any[]
  groupId: string | null
  visibilityIndex: VisibilityIndex
  pending?: boolean
}): KanbanFace {
  const { record, groupFields, fvMap, allFields, groupId, visibilityIndex, pending } = opts
  const dsf = groupFields.find((f) => f.is_default_status)
  const statusLabel = pending ? '' : (dsf ? (fvMap[dsf.id]?.value_text ?? '') : '')
  const statusColor = statusLabel && dsf
    ? (parseOptions(dsf.config).find((o) => o.label === statusLabel)?.color || STATUS_EMPTY)
    : STATUS_EMPTY
  const common = groupFields
    .filter((f) => f.common_field_key_id && f.field_type !== 'checklist' && !f.is_default_status)
    .sort((a, b) => (COMMON_PRIORITY[a.field_type] ?? 9) - (COMMON_PRIORITY[b.field_type] ?? 9))
    .map((f) => ({ name: f.name, value: formatCellValue(f, fvMap[f.id]) }))
    .filter((c) => c.value)
    .slice(0, 2)
  const checklist = computeGroupChecklist(allFields, groupId, visibilityIndex, fvMap)
  return { title: record.title, statusLabel, statusColor, common, hasOwner: !!record.owner_user_id, checklist }
}

export function KanbanCardFace({ title, statusLabel, statusColor, common, hasOwner, checklist }: KanbanFace) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-foreground">{title || 'Untitled'}</span>
        {hasOwner && <User className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground/60" aria-label="Assigned" />}
      </div>

      {statusLabel && (
        <span className="mt-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: statusColor }}>
          {statusLabel}
        </span>
      )}

      {common.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {common.map((c, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className="text-muted-foreground">{c.name}:</span>
              <span className="truncate text-foreground">{c.value}</span>
            </div>
          ))}
        </div>
      )}

      {checklist.hasChecklist && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CheckSquare className={cn('h-3 w-3', checklist.percentage === 100 ? 'text-emerald-400' : 'text-muted-foreground')} />
          <span className="tabular-nums">{checklist.completedCount} / {checklist.totalCount} · {checklist.percentage}%</span>
        </div>
      )}
    </>
  )
}
