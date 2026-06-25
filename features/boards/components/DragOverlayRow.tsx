import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

// Phase 37B-2E — full ROW preview for the table drag overlay (not a name chip).
// Sized to the source row's measured width (active.rect) so it reads as the full
// row lifted off the table rather than collapsing to content width. The title
// cell flexes to fill, so it spans the row width even with few key cells.
export function DragOverlayRow({
  title, cells, widthStyle,
}: {
  title: string
  cells: { name: string; value: string }[]
  widthStyle?: React.CSSProperties
}) {
  return (
    <div
      style={widthStyle}
      className={cn(
        'flex items-stretch overflow-hidden rounded-lg border border-jubo-navy/50 bg-card shadow-2xl origin-left scale-[1.01] cursor-grabbing',
        !widthStyle && 'min-w-[480px]',
      )}
    >
      <div className="flex min-w-[200px] flex-1 items-center gap-2 px-3 py-2">
        <GripVertical className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium text-foreground">{title || 'Untitled'}</span>
      </div>
      {cells.slice(0, 6).map((c, i) => (
        <div key={i} className="flex w-36 flex-shrink-0 flex-col justify-center border-l border-border/60 px-3 py-2">
          <span className="truncate text-xs text-foreground">{c.value || '—'}</span>
        </div>
      ))}
    </div>
  )
}
