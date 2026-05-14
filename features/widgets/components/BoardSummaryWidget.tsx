import { cn } from '@/lib/utils'
import type { BoardSummaryData } from '../types'

interface BoardSummaryWidgetProps {
  data: BoardSummaryData
}

export function BoardSummaryWidget({ data }: BoardSummaryWidgetProps) {
  if (data.rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No data yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.rows.map(row => (
        <div key={row.label} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {row.color && (
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: row.color }}
                />
              )}
              <span className="text-sm text-foreground truncate">{row.label}</span>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {row.total_value > 0 && (
                <span className="text-xs text-muted-foreground">
                  ${row.total_value.toLocaleString()}
                </span>
              )}
              <span className="text-xs font-semibold text-foreground w-6 text-right">
                {row.count}
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${row.percentage}%`,
                background: row.color ?? 'hsl(var(--primary))',
              }}
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between pt-2 mt-1 border-t border-border">
        <span className="text-xs text-muted-foreground">Total</span>
        <div className="flex items-center gap-3">
          {data.grand_total_value > 0 && (
            <span className="text-xs text-muted-foreground">
              ${data.grand_total_value.toLocaleString()}
            </span>
          )}
          <span className="text-xs font-semibold text-foreground">
            {data.grand_total_count}
          </span>
        </div>
      </div>
    </div>
  )
}
