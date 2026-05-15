import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GapAnalysisData } from '../../types'

interface Props { data: GapAnalysisData }

export function GapAnalysisWidget({ data }: Props) {
  if (data.rows.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <CheckCircle2 className="w-5 h-5" />
        <p className="text-xs">No gap data yet — set conversion assumptions and a goal target.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-1.5 -mx-2">
      {data.rows.map(row => {
        const behind = row.gap > 0.5
        const ahead  = row.gap < -0.5
        const pacePct = Math.max(0, Math.min(200, row.pace_percent))
        return (
          <div key={row.stage_id} className="px-2 py-2 rounded-md hover:bg-surface-1 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex-1 text-sm text-foreground truncate">{row.stage_name}</span>
              <span className={cn(
                'text-xs font-medium tabular-nums',
                behind && 'text-red-400',
                ahead && 'text-emerald-400',
                !behind && !ahead && 'text-muted-foreground',
              )}>
                {behind && <AlertTriangle className="inline w-3 h-3 mr-1" />}
                {behind ? `behind by ${Math.ceil(row.gap).toLocaleString()}` : ahead ? `ahead by ${Math.ceil(-row.gap).toLocaleString()}` : 'on pace'}
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div
                className={cn('absolute inset-y-0 left-0 rounded-full transition-all',
                  behind ? 'bg-red-400/70' : ahead ? 'bg-emerald-400/70' : 'bg-amber-400/70')}
                style={{ width: `${(pacePct / 200) * 100}%` }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-foreground/30" style={{ left: '50%' }} />
            </div>
            <div className="flex items-center justify-between text-2xs text-muted-foreground mt-1 tabular-nums">
              <span>{Math.round(row.current).toLocaleString()} of {Math.ceil(row.expected_so_far).toLocaleString()} expected</span>
              <span>{Math.round(row.pace_percent)}%</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
