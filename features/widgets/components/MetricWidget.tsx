import {
  BarChart2, TrendingUp, Users, DollarSign, FileText, Activity,
  Target, Zap, Phone, Calendar, Star, AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetricWidgetConfig, MetricWidgetData, WidgetColor } from '../types'
import { WIDGET_COLORS } from '../types'

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart2, TrendingUp, Users, DollarSign, FileText, Activity,
  Target, Zap, Phone, Calendar, Star, AlertTriangle,
}

interface MetricWidgetProps {
  config: MetricWidgetConfig
  data: MetricWidgetData
}

export function MetricWidget({ config, data }: MetricWidgetProps) {
  const Icon = config.icon ? ICON_MAP[config.icon] : null
  // Fall back to blue for any missing/unknown color (?? only guarded null, not
  // a stored color outside the 6-color set — an unknown value crashed the card).
  const colors = WIDGET_COLORS[config.color as WidgetColor] ?? WIDGET_COLORS.blue

  return (
    <div className="h-full flex flex-col justify-between gap-4">
      <div className="flex items-start justify-between">
        {Icon && (
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', colors.bg)}>
            <Icon className={cn('w-4.5 h-4.5', colors.text)} />
          </div>
        )}
      </div>

      <div>
        <p className={cn('text-3xl font-bold tracking-tight', colors.text)}>
          {data.formatted}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {config.aggregation === 'count' ? 'total records' : 'total value'}
          {config.board_id ? '' : ' · all boards'}
        </p>
      </div>
    </div>
  )
}
