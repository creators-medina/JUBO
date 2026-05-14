'use client'

import { Settings2, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WidgetShellProps {
  title: string
  accent?: string
  children: React.ReactNode
  onEdit?: () => void
  onRemove?: () => void
  error?: string
  className?: string
}

export function WidgetShell({ title, accent, children, onEdit, onRemove, error, className }: WidgetShellProps) {
  return (
    <div className={cn(
      'h-full rounded-xl border border-border bg-card flex flex-col overflow-hidden',
      accent && `border-l-2 border-l-[${accent}]`,
      className,
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">
          {title}
        </h3>
        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
          {onEdit && (
            <button
              onClick={onEdit}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Configure widget"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors"
              title="Remove widget"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden p-4">
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
