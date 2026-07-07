import {
  BarChart2, TrendingUp, Users, DollarSign, FileText, Activity,
  Target, Zap, Phone, Calendar, Star, AlertTriangle,
  UserPlus, GitBranch, Files,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MetricWidgetConfig, MetricWidgetData, WidgetColor } from '../types'
import { WIDGET_COLORS } from '../types'

const ICON_MAP: Record<string, React.ElementType> = {
  BarChart2, TrendingUp, Users, DollarSign, FileText, Activity,
  Target, Zap, Phone, Calendar, Star, AlertTriangle,
  UserPlus, GitBranch, Files,
}

interface MetricWidgetProps {
  config: MetricWidgetConfig
  data: MetricWidgetData
}

export function MetricWidget({ config, data }: MetricWidgetProps) {
  const Icon = config.icon ? ICON_MAP[config.icon] : null
  // Defensive lookup: an unknown color (e.g. from a seeded/imported widget
  // config) must NEVER crash the page — `?? 'blue'` alone only catches null,
  // not unmapped keys, and `colors.text` on undefined took down the whole
  // dashboard route with an uncaught TypeError.
  const colors = WIDGET_COLORS[(config.color as WidgetColor) ?? 'blue'] ?? WIDGET_COLORS.blue

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
