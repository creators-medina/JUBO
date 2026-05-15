'use client'

import { Settings2, X, AlertCircle, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WidgetShellProps {
  title: string
  children: React.ReactNode
  onEdit?: () => void
  onRemove?: () => void
  error?: string
  className?: string
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}

export function WidgetShell({ title, children, onEdit, onRemove, error, className, dragHandleProps }: WidgetShellProps) {
  return (
    <div className={cn(
      'h-full rounded-xl border border-border bg-card flex flex-col overflow-hidden',
      className,
    )}>
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-2.5 border-b border-border flex-shrink-0">
        {dragHandleProps && (
          <button
            {...dragHandleProps}
            className="p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors flex-shrink-0"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <h3 className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {title}
        </h3>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Configure widget"
            >
              <Settings2 className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors"
              title="Remove widget"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-4">
        {error ? (
          <div className="h-full flex items-center justify-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <p className="text-xs">{error}</p>
          </div>
        ) : children}
      </div>
    </div>
  )
}
