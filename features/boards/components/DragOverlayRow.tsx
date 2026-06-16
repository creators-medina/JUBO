import { GripVertical } from 'lucide-react'

// Phase 37B-2E — full ROW preview for the table drag overlay (not a name chip).
// Renders the Item cell + the visible field cells at the same column proportions
// as the real row, so the dragged element reads as the full row lifted off the
// table. Presentation only.
export function DragOverlayRow({ title, cells }: { title: string; cells: { name: string; value: string }[] }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-lg border border-primary/50 bg-card shadow-2xl origin-left scale-[1.01] cursor-grabbing">
      <div className="flex min-w-[200px] items-center gap-2 px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{title || 'Untitled'}</span>
      </div>
      {cells.slice(0, 6).map((c, i) => (
        <div key={i} className="flex w-36 flex-col justify-center border-l border-border/60 px-3 py-2">
          <span className="truncate text-xs text-foreground">{c.value || '—'}</span>
        </div>
      ))}
    </div>
  )
}
