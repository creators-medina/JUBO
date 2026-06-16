'use client'

// ─────────────────────────────────────────────────────────────────────────
// Kanban View V1 (Phase 37B-1) — READ-ONLY alternate rendering of the board.
//
// Consumes the SAME data BoardDetailClient already loaded/computed (groups,
// per-group visible fields, field values index, checklist engine). Issues ZERO
// new queries. No drag/drop, no writes, no owner fetch. Cards are clickable
// (open the existing workspace) but NOT draggable — drag is 37B-2.
//
// Columns are modeled as Stages { id, boardId, groupId, label }; every card and
// column is addressed by the FULL (boardId, groupId), never groupId alone, so
// 37B-2's board-aware drag dispatcher drops in without a refactor.
// ─────────────────────────────────────────────────────────────────────────

import { CheckSquare, User } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { parseOptions } from '@/features/fields/status'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { cn } from '@/lib/utils'

export type Stage = { id: string; boardId: string; groupId: string; label: string }

interface Props {
  stages: Stage[]
  recordsByGroup: Record<string, any[]>
  totalByGroup: Record<string, number>
  fieldsByGroup: Record<string, any[]>
  fieldValuesIndex: Record<string, Record<string, any>>
  fields: any[]
  visibilityIndex: VisibilityIndex
  pendingMoveIds?: Set<string>
  onSelectRecord: (recordId: string, title: string) => void
}

const STATUS_EMPTY = '#64748b'

function formatValue(field: any, fv: any): string {
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

// Prefer email → phone → currency, else first keyed field.
const COMMON_PRIORITY: Record<string, number> = { email: 0, phone: 1, currency: 2 }

export function BoardKanbanView({
  stages, recordsByGroup, totalByGroup, fieldsByGroup, fieldValuesIndex, fields, visibilityIndex, pendingMoveIds, onSelectRecord,
}: Props) {
  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-4">
      {stages.map((stage) => {
        const records = recordsByGroup[stage.groupId] ?? []
        const groupFields = fieldsByGroup[stage.groupId] ?? []
        return (
          <KanbanColumn
            key={stage.id}
            stage={stage}
            count={totalByGroup[stage.groupId] ?? records.length}
            records={records}
            groupFields={groupFields}
            fields={fields}
            fieldValuesIndex={fieldValuesIndex}
            visibilityIndex={visibilityIndex}
            pendingMoveIds={pendingMoveIds}
            onSelectRecord={onSelectRecord}
          />
        )
      })}
    </div>
  )
}

function KanbanColumn({
  stage, count, records, groupFields, fields, fieldValuesIndex, visibilityIndex, pendingMoveIds, onSelectRecord,
}: {
  stage: Stage
  count: number
  records: any[]
  groupFields: any[]
  fields: any[]
  fieldValuesIndex: Record<string, Record<string, any>>
  visibilityIndex: VisibilityIndex
  pendingMoveIds?: Set<string>
  onSelectRecord: (recordId: string, title: string) => void
}) {
  const defaultStatusField = groupFields.find((f) => f.is_default_status)
  // Common-keyed display fields visible in THIS group (per-group visibility honored
  // because groupFields is the already-resolved visible set). No registry query.
  const commonFields = groupFields
    .filter((f) => f.common_field_key_id && f.field_type !== 'checklist' && !f.is_default_status)
    .sort((a, b) => (COMMON_PRIORITY[a.field_type] ?? 9) - (COMMON_PRIORITY[b.field_type] ?? 9))

  // Phase 37B-2 — column is a drop target. Distinct ID space ('kanban-stage:').
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-stage:${stage.id}`,
    data: { type: 'drop', groupId: stage.groupId, boardId: stage.boardId },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn('flex w-72 flex-shrink-0 flex-col rounded-xl border bg-surface-1/30 transition-colors duration-150 motion-reduce:transition-none', isOver ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20' : 'border-border')}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="text-xs font-semibold text-foreground">{stage.label}</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-2xs font-medium tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto px-2 pb-2">
        {records.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 px-3 py-6 text-center text-2xs text-muted-foreground">{isOver ? 'Drop here' : 'No records'}</div>
        ) : (
          records.map((record) => (
            <KanbanCard
              key={record.id}
              stage={stage}
              record={record}
              defaultStatusField={defaultStatusField}
              commonFields={commonFields}
              fieldValueMap={fieldValuesIndex[record.id] ?? {}}
              checklist={computeGroupChecklist(fields, stage.groupId, visibilityIndex, fieldValuesIndex[record.id] ?? {})}
              pending={pendingMoveIds?.has(record.id) ?? false}
              onClick={() => onSelectRecord(record.id, record.title ?? 'Record')}
            />
          ))
        )}
      </div>
    </div>
  )
}

function KanbanCard({
  stage, record, defaultStatusField, commonFields, fieldValueMap, checklist, pending, onClick,
}: {
  stage: Stage
  record: any
  defaultStatusField: any
  commonFields: any[]
  fieldValueMap: Record<string, any>
  checklist: { completedCount: number; totalCount: number; percentage: number; hasChecklist: boolean }
  pending: boolean
  onClick: () => void
}) {
  // Phase 37B-2 — draggable card. Distinct ID space ('kanban-card:'); payload is
  // addressed by FULL (boardId, groupId) via `stage` for the board-aware dispatcher.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `kanban-card:${record.id}`,
    data: { type: 'record', recordId: record.id, fromGroupId: stage.groupId, boardId: stage.boardId, record },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  // Stale status: while a move is pending, the server-side reset hasn't landed yet,
  // so neutralize the chip instead of showing the old status as if it persisted.
  const statusValue = pending ? '' : (defaultStatusField ? (fieldValueMap[defaultStatusField.id]?.value_text ?? '') : '')
  const statusColor = (() => {
    if (!defaultStatusField || !statusValue) return STATUS_EMPTY
    const opt = parseOptions(defaultStatusField.config).find((o) => o.label === statusValue)
    return opt?.color || STATUS_EMPTY
  })()

  const shownCommon = commonFields
    .map((f) => ({ name: f.name, value: formatValue(f, fieldValueMap[f.id]) }))
    .filter((c) => c.value)
    .slice(0, 2)

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={onClick}
      className={cn(
        'w-full cursor-grab rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-[transform,opacity,border-color,background-color] duration-150 ease-out hover:border-primary/40 hover:bg-surface-1 active:cursor-grabbing motion-reduce:transition-none',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-xs font-medium text-foreground">{record.title || 'Untitled'}</span>
        {record.owner_user_id && <User className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground/60" aria-label="Assigned" />}
      </div>

      {defaultStatusField && statusValue && (
        <span
          className="mt-2 inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: statusColor }}
        >
          {statusValue}
        </span>
      )}

      {shownCommon.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {shownCommon.map((c, i) => (
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
    </button>
  )
}
