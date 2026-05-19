import Link from 'next/link'
import { Eye, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttentionView } from './queries'

const PRIORITY_RING: Record<string, string> = {
  urgent: 'border-red-500/40 bg-red-500/5',
  high:   'border-orange-500/40 bg-orange-500/5',
  medium: 'border-amber-500/40 bg-amber-500/5',
  low:    'border-blue-500/40 bg-blue-500/5',
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high:   'bg-orange-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
}

interface Props {
  attentionViews: AttentionView[]
}

export function AttentionViewsList({ attentionViews }: Props) {
  if (attentionViews.length === 0) return null

  return (
    <div className="space-y-1">
      {attentionViews.map(({ view, count, href }) => {
        const priority = view.attention_priority ?? 'medium'
        const label    = view.attention_label ?? view.name
        const explicitColor = view.attention_color
        return (
          <Link
            key={view.id}
            href={href}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-lg border bg-card hover:bg-surface-1 transition-colors group',
              !explicitColor && (PRIORITY_RING[priority] ?? 'border-border'),
            )}
            style={explicitColor ? { borderColor: explicitColor + '66', backgroundColor: explicitColor + '0F' } : undefined}
          >
            <span
              className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', !explicitColor && (PRIORITY_DOT[priority] ?? 'bg-muted-foreground'))}
              style={explicitColor ? { backgroundColor: explicitColor } : undefined}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate group-hover:text-primary">{label}</p>
              <p className="text-2xs text-muted-foreground truncate">{view.name}</p>
            </div>
            <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          </Link>
        )
      })}
    </div>
  )
}

export function AttentionEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4 flex items-start gap-2.5">
      <Eye className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-foreground">No attention views yet</p>
        <p className="text-2xs text-muted-foreground">
          On any board, save a filtered view and toggle &quot;Show on Today&quot; to surface its count here.
        </p>
      </div>
    </div>
  )
}
