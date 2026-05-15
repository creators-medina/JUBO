import { Zap, Filter } from 'lucide-react'
import type { FunnelPaceData } from '../../types'

interface Props { data: FunnelPaceData }

const CADENCE_LABEL: Record<string, string> = {
  daily: 'per day',
  weekly: 'per week',
  monthly: 'per month',
}

export function FunnelPaceWidget({ data }: Props) {
  if (data.rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Filter className="w-5 h-5" />
        <p className="text-xs">No conversion assumptions yet. Set rates in /goals.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground uppercase tracking-wider">
        <Zap className="w-3 h-3" />
        <span>Required {CADENCE_LABEL[data.cadence] ?? data.cadence}</span>
      </div>
      <div className="flex-1 overflow-y-auto -mx-2">
        {data.rows.map(row => (
          <div key={row.stage_id} className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-1 transition-colors">
            <span className="flex-1 text-sm text-foreground truncate">{row.stage_name}</span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {row.cadence_target < 1
                ? row.cadence_target.toFixed(2)
                : Math.ceil(row.cadence_target).toLocaleString()}
            </span>
            <span className="text-2xs text-muted-foreground w-16 text-right tabular-nums">
              {Math.ceil(row.total_required).toLocaleString()} total
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
