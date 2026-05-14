'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu'
import { moveRecord } from '@/features/records/actions'
import { cn } from '@/lib/utils'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-500',
  none: 'bg-transparent',
}

interface Props {
  record: any
  groups: any[]
  boardId: string
  onClick: () => void
}

export function RecordCard({ record, groups, boardId, onClick }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleMove = (toGroupId: string) => {
    startTransition(async () => {
      await moveRecord(record.id, toGroupId, boardId)
      router.refresh()
    })
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col gap-2 p-3 rounded-lg bg-card border border-border',
        'hover:bg-surface-2 hover:border-border/80 transition-colors cursor-pointer',
        isPending && 'opacity-50'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">{record.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border-border" onClick={e => e.stopPropagation()}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">Move to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border">
                {groups.filter(g => g.id !== record.group_id).map(g => (
                  <DropdownMenuItem
                    key={g.id}
                    className="text-xs cursor-pointer"
                    onClick={() => handleMove(g.id)}
                  >
                    {g.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center gap-2">
        {record.priority !== 'none' && (
          <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_COLORS[record.priority] ?? 'bg-transparent')} />
        )}
        {record.value != null && (
          <span className="text-xs text-muted-foreground">${Number(record.value).toLocaleString()}</span>
        )}
      </div>
    </div>
  )
}
