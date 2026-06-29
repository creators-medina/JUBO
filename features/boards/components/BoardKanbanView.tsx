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
import { useHoverCard, BorrowerPreviewPanel } from './BoardHoverCard'
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
  // Stage-stepper data for the hover preview (id = group id so it matches each
  // record's group_id; position preserves lane order). Built once for all cards.
  const previewGroups = stages.map((s, i) => ({ id: s.groupId, name: s.label, position: i }))
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
          previewGroups={previewGroups}
          pendingMoveIds={pendingMoveIds}
          onSelectRecord={onSelectRecord}
          onAddRecord={onAddRecord}
        />
      ))}
    </div>
  )
}

function KanbanColumn({
  stage, accent, count, records, groupFields, fields, fieldValuesIndex, visibilityIndex, previewGroups, pendingMoveIds, onSelectRecord, onAddRecord,
}: {
  stage: Stage
  accent: string
  count: number
  records: any[]
  groupFields: any[]
  fields: any[]
  fieldValuesIndex: Record<string, Record<string, any>>
  visibilityIndex: VisibilityIndex
  previewGroups: { id: string; name: string; position: number }[]
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
        // Warm LOS lane: cream-soft surface, tan border, soft elevation. A faint
        // stage-tinted wash at the top gives each lane a stable identity.
        'flex w-72 flex-shrink-0 flex-col overflow-hidden rounded-xl border bg-jubo-card-soft shadow-sm transition-[box-shadow,background-color] duration-150 motion-reduce:transition-none sm:w-80',
        isOver ? 'border-jubo-navy/40 ring-1 ring-jubo-navy/30 bg-jubo-gold-soft/40' : 'border-jubo-border',
      )}
      style={{ backgroundImage: `radial-gradient(85% 30% at 50% 0%, ${accent}12, transparent 72%)` }}
    >
      {/* Colored top accent — gives each lane a stable identity color. */}
      <div aria-hidden className="h-1 w-full flex-shrink-0" style={{ background: `linear-gradient(90deg, ${accent}, transparent)` }} />

      <div className="flex flex-shrink-0 items-center gap-2 border-b border-jubo-border px-3.5 py-3">
        <span aria-hidden className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: accent }} />
        <span className="truncate text-sm font-semibold tracking-tight text-jubo-text">{stage.label}</span>
        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-jubo-gold-soft px-1.5 text-2xs font-semibold tabular-nums text-jubo-gold">{count}</span>
        {onAddRecord && (
          <button
            type="button"
            onClick={() => onAddRecord(stage.groupId)}
            title={`Add to ${stage.label}`}
            className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-jubo-muted transition-colors hover:bg-jubo-card hover:text-jubo-text"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* flex-1 + min-h-0 make this the column's internal scroll region (the
          column itself is overflow-hidden). Without min-h-0 the list grows to
          content height and the column clips the cards. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2.5 py-3">
        {records.length === 0 ? (
          <div className={cn(
            'rounded-xl border border-dashed px-3 py-8 text-center text-2xs transition-colors',
            isOver ? 'border-jubo-navy/50 text-jubo-text' : 'border-jubo-border text-jubo-text-soft',
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
              previewGroups={previewGroups}
              pending={pendingMoveIds?.has(record.id) ?? false}
              onClick={() => onSelectRecord(record.id, record.title ?? 'Record')}
            />
          ))
        )}
        {onAddRecord && (
          <button
            type="button"
            onClick={() => onAddRecord(stage.groupId)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-jubo-border px-3 py-2 text-2xs font-medium text-jubo-text-soft transition-colors hover:border-jubo-border-strong hover:bg-jubo-card hover:text-jubo-text"
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
  stage, record, groupFields, fields, fieldValueMap, visibilityIndex, previewGroups, pending, onClick,
}: {
  stage: Stage
  record: any
  groupFields: any[]
  fields: any[]
  fieldValueMap: Record<string, any>
  visibilityIndex: VisibilityIndex
  previewGroups: { id: string; name: string; position: number }[]
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

  // Phase 4F — per-card drop zone enables within-column REORDER. Dropping a card
  // onto this one (same group) reorders; onto a card in another group still moves
  // group (handled in BoardDetailClient.handleDragEnd). Distinct ID space.
  const drop = useDroppable({
    id: `kanban-card-drop:${record.id}`,
    data: { type: 'record-drop', recordId: record.id, groupId: stage.groupId, boardId: stage.boardId },
  })

  // Phase 3C — borrower preview on hover. Disabled while dragging so it never
  // competes with dnd-kit; the trigger's onPointerDown closes it AND bubbles to
  // the button's drag listeners (the trigger is an inner element), so click-to-
  // open and drag-to-move keep working untouched.
  const hover = useHoverCard({ disabled: isDragging })

  return (
    <>
      {/* Drop wrapper (reorder target). A subtle navy ring marks the insertion
          target while another card hovers over it; never on the card being dragged. */}
      <div
        ref={drop.setNodeRef}
        className={cn('flex-shrink-0 rounded-xl', drop.isOver && !isDragging && 'ring-2 ring-jubo-navy/40')}
      >
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        type="button"
        onClick={onClick}
        className={cn(
          // Warm LOS card — condensed: tight, uniform padding (no left-rail offset).
          // block (not flex) so the face's rows stay full-width; height fits content.
          'relative block w-full flex-shrink-0 cursor-grab overflow-hidden rounded-xl border border-jubo-border bg-jubo-card px-3 py-2.5 text-left shadow-sm transition-[transform,opacity,border-color,box-shadow] duration-150 ease-out hover:border-jubo-border-strong hover:shadow-md active:cursor-grabbing motion-reduce:transition-none',
          isDragging && 'opacity-40',
        )}
      >
        {/* tabIndex −1: the card button is already the tab stop; we only want the
            div's pointer handlers, not a nested focusable inside the button. */}
        <div ref={hover.ref} {...hover.triggerProps} tabIndex={-1} className="outline-none">
          <KanbanCardFace {...face} />
        </div>
      </button>
      </div>
      {hover.open && hover.rect && (
        <BorrowerPreviewPanel
          rect={hover.rect}
          panelProps={hover.panelProps}
          record={record}
          fields={fields}
          fieldValueMap={fieldValueMap}
          groups={previewGroups}
        />
      )}
    </>
  )
}
