'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { WidgetRenderer } from '@/features/widgets/components/WidgetRenderer'
import type { DashboardWidgetRow, WidgetData } from '@/features/widgets/types'

interface SortableWidgetCardProps {
  widget: DashboardWidgetRow
  data: WidgetData
  onRemove?: () => void
  onEdit?: () => void
  onRecordClick?: (recordId: string) => void
}

export function SortableWidgetCard({ widget, data, onRemove, onEdit, onRecordClick }: SortableWidgetCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="h-full">
      <WidgetRenderer
        widget={widget}
        data={data}
        onRemove={onRemove}
        onEdit={onEdit}
        onRecordClick={onRecordClick}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
      />
    </div>
  )
}
