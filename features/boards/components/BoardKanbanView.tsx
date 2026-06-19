'use client'

// ─────────────────────────────────────────────────────────────────────────
// Kanban View (Phase 37B-1/-2/-2D/-2E) — alternate render of the existing board
// data (zero new queries). Drag routes through the shared handler in
// BoardDetailClient → moveRecord(). The card visual lives in KanbanCardFace so
// the DragOverlay can render the identical "lifted card".
// ─────────────────────────────────────────────────────────────────────────

import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { buildKanbanFace, KanbanCardFace } from './KanbanCardFace'
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

export function BoardKanbanView({
  stages, recordsByGroup, totalByGroup, fieldsByGroup, fieldValuesIndex, fields, visibilityIndex, pendingMoveIds, onSelectRecord,
}: Props) {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4">
      {stages.map((stage) => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          count={totalByGroup[stage.groupId] ?? (recordsByGroup[stage.groupId] ?? []).length}
          records={recordsByGroup[stage.groupId] ?? []}
          groupFields={fieldsByGroup[stage.groupId] ?? []}
          fields={fields}
          fieldValuesIndex={fieldValuesIndex}
          visibilityIndex={visibilityIndex}
          pendingMoveIds={pendingMoveIds}
          onSelectRecord={onSelectRecord}
        />
      ))}
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
  // Phase 37B-2 — column is a drop target. Distinct ID space ('kanban-stage:').
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-stage:${stage.id}`,
    data: { type: 'drop', groupId: stage.groupId, boardId: stage.boardId },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn('flex w-72 flex-shrink-0 flex-col rounded-xl border bg-surface-1/30 transition-colors duration-150 motion-reduce:transition-none sm:w-80', isOver ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/20' : 'border-border')}
    >
      <div className="flex items-center gap-2 border-b border-border/50 px-3.5 py-3">
        <span className="text-sm font-semibold tracking-tight text-foreground">{stage.label}</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-2xs font-semibold tabular-nums text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-2.5 overflow-y-auto px-2.5 py-2.5">
        {records.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-3 py-8 text-center text-2xs text-muted-foreground">{isOver ? 'Drop here' : 'No records'}</div>
        ) : (
          records.map((record) => (
            <KanbanCard
              key={record.id}
              stage={stage}
              record={record}
              groupFields={groupFields}
              fields={fields}
              fieldValueMap={fieldValuesIndex[record.id] ?? {}}
              visibilityIndex={visibilityIndex}
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
  stage, record, groupFields, fields, fieldValueMap, visibilityIndex, pending, onClick,
}: {
  stage: Stage
  record: any
  groupFields: any[]
  fields: any[]
  fieldValueMap: Record<string, any>
  visibilityIndex: VisibilityIndex
  pending: boolean
  onClick: () => void
}) {
  // Phase 37B-2 — draggable card. Distinct ID space ('kanban-card:'); payload is
  // addressed by FULL (boardId, groupId) via `stage` for the board-aware dispatcher.
  // Face is computed ONCE here for the real card; the overlay reuses this exact
  // object (stashed in drag data) — it never recomputes or re-reads values.
  const face = buildKanbanFace({
    record, groupFields, fvMap: fieldValueMap, allFields: fields, groupId: stage.groupId, visibilityIndex, pending,
  })

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `kanban-card:${record.id}`,
    data: { type: 'record', recordId: record.id, fromGroupId: stage.groupId, boardId: stage.boardId, record, view: 'kanban', face },
  })
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      onClick={onClick}
      className={cn(
        'w-full cursor-grab rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-[transform,opacity,border-color,background-color,box-shadow] duration-150 ease-out hover:border-primary/40 hover:bg-surface-1 hover:shadow-md active:cursor-grabbing motion-reduce:transition-none',
        isDragging && 'opacity-40',
      )}
    >
      <KanbanCardFace {...face} />
    </button>
  )
}
