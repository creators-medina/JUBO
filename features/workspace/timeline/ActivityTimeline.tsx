'use client'

import { useMemo } from 'react'
import {
  StickyNote, Phone, Mail, MessageSquare, Calendar, RefreshCw, Pencil,
  UserPlus, Sparkles, Plug, MoveRight, FileText, CheckCircle2, ListChecks, Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import type { TimelineItem } from '../types'

const ACTIVITY_ICONS: Record<string, React.ElementType> = {
  note:               StickyNote,
  call:               Phone,
  email:              Mail,
  sms:                MessageSquare,
  meeting:            Calendar,
  status_change:      RefreshCw,
  field_change:       Pencil,
  assignment:         UserPlus,
  creation:           FileText,
  automation:         Sparkles,
  ai_insight:         Sparkles,
  integration_event:  Plug,
  // Synthetic types we synthesize from non-activities tables
  task_created:       ListChecks,
  task_completed:     CheckCircle2,
  movement:           MoveRight,
}

const ACTIVITY_COLOR: Record<string, string> = {
  note:           'text-amber-400 bg-amber-500/10',
  call:           'text-blue-400 bg-blue-500/10',
  email:          'text-blue-400 bg-blue-500/10',
  sms:            'text-blue-400 bg-blue-500/10',
  meeting:        'text-violet-400 bg-violet-500/10',
  status_change:  'text-emerald-400 bg-emerald-500/10',
  field_change:   'text-muted-foreground bg-surface-2',
  assignment:     'text-pink-400 bg-pink-500/10',
  creation:       'text-foreground bg-surface-2',
  automation:     'text-violet-400 bg-violet-500/10',
  ai_insight:     'text-violet-400 bg-violet-500/10',
  task_created:   'text-foreground bg-surface-2',
  task_completed: 'text-emerald-400 bg-emerald-500/10',
  movement:       'text-blue-400 bg-blue-500/10',
}

const ACTIVITY_VERB: Record<string, string> = {
  note:               'noted',
  call:               'logged a call',
  email:              'sent an email',
  sms:                'sent a message',
  meeting:            'logged a meeting',
  status_change:      'changed status',
  field_change:       'updated a field',
  assignment:         'assigned',
  creation:           'created the record',
  automation:         'automation ran',
  ai_insight:         'AI insight',
  integration_event:  'integration event',
  task_created:       'created a task',
  task_completed:     'completed a task',
  movement:           'moved the record',
}

interface Props {
  items: TimelineItem[]
  emptyHint?: string
}

function groupByDay(items: TimelineItem[]): Array<{ label: string; items: TimelineItem[] }> {
  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)

  const groups = new Map<string, TimelineItem[]>()
  for (const item of items) {
    const key = item.timestamp.slice(0, 10)
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }

  const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a))
  return sortedKeys.map(key => {
    let label: string
    if (key === todayKey)     label = 'Today'
    else if (key === yesterdayKey) label = 'Yesterday'
    else {
      const d = new Date(key + 'T00:00:00')
      label = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
    }
    return { label, items: groups.get(key)! }
  })
}

export function ActivityTimeline({ items, emptyHint = 'No activity yet.' }: Props) {
  const groups = useMemo(() => groupByDay(items), [items])

  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.map(group => (
        <div key={group.label} className="space-y-2">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground sticky top-0 bg-card/95 backdrop-blur-sm py-1 z-[1]">
            {group.label}
          </p>
          <div className="space-y-1">
            {group.items.map(item => <TimelineRow key={`${item.type}-${item.id}`} item={item} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const Icon = ACTIVITY_ICONS[item.activity_type] ?? Circle
  const accent = ACTIVITY_COLOR[item.activity_type] ?? 'text-muted-foreground bg-surface-2'
  const verb = ACTIVITY_VERB[item.activity_type] ?? item.activity_type.replace('_', ' ')

  // Communication-derived activities carry direction/outcome in metadata.
  const meta = item.metadata as { direction?: string; outcome?: string; follow_up_at?: string | null } | undefined
  const outcome = meta?.outcome as string | undefined

  return (
    <div className="flex gap-3 py-1.5 group">
      <span className={cn('mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0', accent)}>
        <Icon className="w-2.5 h-2.5" />
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-medium text-foreground">
            {item.actor_name ?? 'System'}
          </span>
          <span className="text-xs text-muted-foreground">{verb}</span>
          {meta?.direction && (
            <span className="rounded bg-surface-2 px-1 py-0 text-2xs capitalize text-muted-foreground">{meta.direction}</span>
          )}
          {outcome && (
            <span className={cn('rounded px-1 py-0 text-2xs',
              outcome === 'connected' || outcome === 'completed' ? 'bg-emerald-500/15 text-emerald-300'
              : outcome === 'follow_up_needed' ? 'bg-amber-500/15 text-amber-300'
              : 'bg-surface-2 text-muted-foreground')}>
              {outcome.replace(/_/g, ' ')}
            </span>
          )}
          {meta?.follow_up_at && <span className="text-2xs text-amber-400">· follow-up set</span>}
          <span className="text-2xs text-muted-foreground/70 ml-auto tabular-nums">
            {formatDistanceToNow(item.timestamp)}
          </span>
        </div>
        {item.content && (
          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
            {item.content}
          </p>
        )}
      </div>
    </div>
  )
}
