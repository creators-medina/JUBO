import { cn } from '@/lib/utils'
import type { ListWidgetData, ListRecord } from '../types'

const STATUS_DOT: Record<string, string> = {
  active:   'bg-blue-400',
  won:      'bg-emerald-400',
  lost:     'bg-red-400',
  on_hold:  'bg-amber-400',
  archived: 'bg-zinc-500',
}

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'text-red-400',
  high:   'text-orange-400',
  medium: 'text-amber-400',
  low:    'text-blue-400',
  none:   'text-muted-foreground',
}

function RecordRow({ record }: { record: ListRecord }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-1 transition-colors cursor-default">
      <span className={cn(
        'w-1.5 h-1.5 rounded-full flex-shrink-0',
        STATUS_DOT[record.status] ?? 'bg-zinc-500',
      )} />
      <span className="flex-1 text-sm text-foreground truncate">
        {record.title}
      </span>
      {record.group_name && (
        <span className="text-2xs text-muted-foreground truncate max-w-[80px]">
          {record.group_name}
        </span>
      )}
      {record.priority !== 'none' && (
        <span className={cn('text-2xs font-medium uppercase', PRIORITY_BADGE[record.priority])}>
          {record.priority.slice(0, 3)}
        </span>
      )}
      {record.value != null && (
        <span className="text-xs font-semibold text-foreground">
          ${record.value.toLocaleString()}
        </span>
      )}
    </div>
  )
}

interface ListWidgetProps {
  data: ListWidgetData
}

export function ListWidget({ data }: ListWidgetProps) {
  if (data.records.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No records found</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 -mx-2">
      {data.records.map(record => (
        <RecordRow key={record.id} record={record} />
      ))}
      {data.total > 0 && (
        <p className="text-2xs text-muted-foreground pt-2 px-2">
          {data.total} record{data.total !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
