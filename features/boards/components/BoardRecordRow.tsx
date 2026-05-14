'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FieldValueCell } from './FieldValueCell'
import { moveRecord } from '@/features/records/actions'
import { cn } from '@/lib/utils'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-500',
  none: '',
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  won: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  lost: 'bg-red-500/15 text-red-400 border-red-500/30',
  on_hold: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  archived: 'bg-surface-3 text-muted-foreground border-border',
}

interface Props {
  record: any
  fields: any[]
  fieldValueMap: Record<string, any> // field_id -> field_value row
  groups: any[]
  boardId: string
  onClick: () => void
}

export function BoardRecordRow({ record, fields, fieldValueMap, groups, boardId, onClick }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleMove = (toGroupId: string) => {
    startTransition(async () => {
      await moveRecord(record.id, toGroupId, boardId)
      router.refresh()
    })
  }

  return (
    <tr
      onClick={onClick}
      className={cn(
        'group border-b border-border cursor-pointer transition-colors',
        'hover:bg-surface-1',
        isPending && 'opacity-50'
      )}
    >
      {/* Title column */}
      <td className="sticky left-0 z-10 bg-card group-hover:bg-surface-1 transition-colors px-3 py-2 min-w-[220px] max-w-[300px]">
        <div className="flex items-center gap-2">
          {record.priority !== 'none' && PRIORITY_COLORS[record.priority] && (
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_COLORS[record.priority])} />
          )}
          <span className="text-sm font-medium text-foreground truncate">{record.title}</span>
        </div>
      </td>

      {/* Status */}
      <td className="px-3 py-2 w-28">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-2xs font-medium border capitalize', STATUS_BADGE[record.status] ?? STATUS_BADGE.active)}>
          {record.status?.replace('_', ' ')}
        </span>
      </td>

      {/* Priority */}
      <td className="px-3 py-2 w-24">
        <span className="text-xs text-muted-foreground capitalize">{record.priority}</span>
      </td>

      {/* Value */}
      <td className="px-3 py-2 w-28 tabular-nums text-xs text-muted-foreground">
        {record.value != null ? `$${Number(record.value).toLocaleString()}` : '—'}
      </td>

      {/* Dynamic field columns */}
      {fields.map(field => (
        <td key={field.id} className="px-3 py-2 w-36 text-xs text-foreground">
          <FieldValueCell field={field} fieldValue={fieldValueMap[field.id] ?? null} />
        </td>
      ))}

      {/* Row actions */}
      <td className="px-2 py-2 w-8 text-right" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border-border">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">Move to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border">
                {groups.filter(g => g.id !== record.group_id).map(g => (
                  <DropdownMenuItem key={g.id} className="text-xs cursor-pointer" onClick={() => handleMove(g.id)}>
                    {g.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  )
}
