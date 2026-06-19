'use client'

// ─────────────────────────────────────────────────────────────────────────
// Kanban View (Phase 37B-1/-2/-2D/-2E) — alternate render of the existing board
// data (zero new queries). Drag routes through the shared handler in
// BoardDetailClient → moveRecord(). The card visual lives in KanbanCardFace so
// the DragOverlay can render the identical "lifted card".
// ─────────────────────────────────────────────────────────────────────────

import { Plus } from 'lucide-react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { buildKanbanFace, KanbanCardFace } from './KanbanCardFace'
import { stageColor } from './BoardStageSummary'
import { cn } from '@/lib/utils'

export type Stage = { id: string; boardId: string; groupId: string; label: string; color?: string | null }

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
  onAddRecord?: (groupId: string) => void
}

export function BoardKanbanView({
  stages, recordsByGroup, totalByGroup, fieldsByGroup, fieldValuesIndex, fields, visibilityIndex, pendingMoveIds, onSelectRecord, onAddRecord,
}: Props) {
  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4">
      {stages.map((stage, i) => (
        <KanbanColumn
          key={stage.id}
          stage={stage}
          accent={stageColor(stage, i)}
          count={totalByGroup[stage.groupId] ?? (recordsByGroup[stage.groupId] ?? []).length}
          records={recordsByGroup[stage.groupId] ?? []}
          groupFields={fieldsByGroup[stage.groupId] ?? []}
          fields={fields}
          fieldValuesIndex={fieldValuesIndex}
          visibilityIndex={visibilityIndex}
          pendingMoveIds={pendingMoveIds}
          onSelectRecord={onSelectRecord}
          onAddRecord={onAddRecord}
        />
      ))}
    </div>
  )
}

function KanbanColumn({
  stage, accent, count, records, groupFields, fields, fieldValuesIndex, visibilityIndex, pendingMoveIds, onSelectRecord, onAddRecord,
}: {
  stage: Stage
  accent: string
  count: number
  records: any[]
  groupFields: any[]
  fields: any[]
  fieldValuesIndex: Record<string, Record<string, any>>
  visibilityIndex: VisibilityIndex
  pendingMoveIds?: Set<string>
  onSelectRecord: (recordId: string, title: string) => void
  onAddRecord?: (groupId: string) => void
}) {
  // Phase 37B-2 — column is a drop target. Distinct ID space ('kanban-stage:').
  const { setNodeRef, isOver } = useDroppable({
    id: `kanban-stage:${stage.id}`,
    data: { type: 'drop', groupId: stage.groupId, boardId: stage.boardId },
  })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        // Premium glassy lane: subtle multi-color edge + interactive glimmer +
        // a stage-tinted top color wash (Phase 36C).
        'premium-surface premium-surface--hover-sweep flex w-72 flex-shrink-0 flex-col rounded-xl bg-surface-1/40 backdrop-blur-md transition-[box-shadow,background-color] duration-150 motion-reduce:transition-none sm:w-80',
        isOver ? 'bg-primary/5 ring-1 ring-primary/40' : '',
      )}
      style={{ backgroundImage: `radial-gradient(85% 35% at 50% 0%, ${accent}14, transparent 72%)` }}
    >
      {/* Colored top accent — gives each lane a stable identity color. */}
      <div aria-hidden className="h-1 w-full flex-shrink-0" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />

      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border/50 px-3.5 py-3">
        <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <span className="truncate text-sm font-semibold tracking-tight text-foreground">{stage.label}</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-surface-2 px-1.5 text-2xs font-semibold tabular-nums text-muted-foreground">{count}</span>
        {onAddRecord && (
          <button
            type="button"
            onClick={() => onAddRecord(stage.groupId)}
            title={`Add to ${stage.label}`}
            className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* flex-1 + min-h-0 make this the column's internal scroll region (the
          column itself is overflow-hidden via premium-surface). Without min-h-0
          the list grows to content height and the column clips the cards. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-3">
        {records.length === 0 ? (
          <div className={cn(
            'rounded-xl border border-dashed px-3 py-8 text-center text-2xs transition-colors',
            isOver ? 'border-primary/50 text-foreground' : 'border-border/60 text-muted-foreground',
          )}>
            {isOver ? 'Drop here' : 'No records'}
          </div>
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
        {onAddRecord && (
          <button
            type="button"
            onClick={() => onAddRecord(stage.groupId)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 px-3 py-2 text-2xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-surface-1 hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            Add card
          </button>
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
        // Soft dark-glass card. block (not flex) so the face's block rows stay
        // full-width and the status pill stays content-width. relative+
        // overflow-hidden clips the colored rail to the rounded corners.
        'relative block w-full flex-shrink-0 min-h-[4rem] cursor-grab overflow-hidden rounded-xl border border-border/70 bg-card/80 py-3.5 pl-4 pr-3.5 text-left shadow-sm backdrop-blur-sm transition-[transform,opacity,border-color,background-color,box-shadow] duration-150 ease-out hover:border-primary/40 hover:bg-surface-1/90 hover:shadow-md active:cursor-grabbing motion-reduce:transition-none',
        isDragging && 'opacity-40',
      )}
    >
      <KanbanCardFace {...face} />
    </button>
  )
}
