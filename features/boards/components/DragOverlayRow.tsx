import { GripVertical } from 'lucide-react'

export function DragOverlayRow({ record }: { record: any }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-card border border-primary/50 rounded-lg shadow-2xl opacity-95 w-72 origin-center scale-[1.02] cursor-grabbing">
      <GripVertical className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <span className="text-sm font-medium text-foreground truncate">{record.title}</span>
    </div>
  )
}
