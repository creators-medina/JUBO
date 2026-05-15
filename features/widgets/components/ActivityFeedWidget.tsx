import { formatDistanceToNow } from '@/lib/date'
import {
  Plus, MessageSquare, FileText, Phone, Mail, ArrowRight,
  Edit2, Calendar, User, Zap, Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityFeedData } from '../types'

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  creation:      Plus,
  comment:       MessageSquare,
  note:          FileText,
  call:          Phone,
  email:         Mail,
  sms:           MessageSquare,
  meeting:       Calendar,
  status_change: ArrowRight,
  field_change:  Edit2,
  assignment:    User,
  automation:    Zap,
}

const ACTIVITY_VERB: Record<string, string> = {
  creation:      'created',
  comment:       'commented on',
  note:          'added note to',
  call:          'logged call on',
  email:         'emailed',
  sms:           'texted',
  meeting:       'scheduled meeting for',
  status_change: 'updated status of',
  field_change:  'updated',
  assignment:    'assigned',
  automation:    'triggered automation on',
}

const ACTIVITY_COLOR: Record<string, string> = {
  creation:      'bg-blue-500/15 text-blue-400',
  comment:       'bg-violet-500/15 text-violet-400',
  note:          'bg-amber-500/15 text-amber-400',
  call:          'bg-emerald-500/15 text-emerald-400',
  email:         'bg-cyan-500/15 text-cyan-400',
  status_change: 'bg-orange-500/15 text-orange-400',
  field_change:  'bg-zinc-500/15 text-zinc-400',
}

interface ActivityFeedWidgetProps {
  data: ActivityFeedData
}

export function ActivityFeedWidget({ data }: ActivityFeedWidgetProps) {
  if (data.items.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">No recent activity</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 -mx-2">
      {data.items.map(item => {
        const Icon = ACTIVITY_ICON[item.activity_type] ?? Activity
        const colorClass = ACTIVITY_COLOR[item.activity_type] ?? 'bg-zinc-500/15 text-zinc-400'
        const verb = ACTIVITY_VERB[item.activity_type] ?? item.activity_type.replace('_', ' ')

        return (
          <div key={item.id} className="flex items-start gap-3 px-2 py-2 rounded-md hover:bg-surface-1 transition-colors">
            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5', colorClass)}>
              <Icon className="w-3 h-3" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-foreground leading-snug">
                {item.user_name && (
                  <span className="font-medium">{item.user_name} </span>
                )}
                <span className="text-muted-foreground">{verb} </span>
                {item.record_title && (
                  <span className="font-medium text-foreground">{item.record_title}</span>
                )}
                {item.content && !item.record_title && (
                  <span className="text-muted-foreground truncate">{item.content.slice(0, 60)}</span>
                )}
              </p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(item.created_at)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
