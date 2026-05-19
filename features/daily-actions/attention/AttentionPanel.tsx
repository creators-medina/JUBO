import Link from 'next/link'
import { AlertTriangle, Flame, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AttentionView } from './queries'

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high:   'bg-orange-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
}

interface Props {
  views: AttentionView[]
  staleRecords: Array<{ id: string; title: string; board_id: string; updated_at: string }>
}

export function AttentionPanel({ views, staleRecords }: Props) {
  const hasViews   = views.length > 0
  const hasStale   = staleRecords.length > 0

  if (!hasViews && !hasStale) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          Nothing flagged. Mark a saved view as &quot;Show in Today&quot; on any board to surface it here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {hasViews && (
        <div className="space-y-1">
          {views.map(({ view, count, href }) => {
            const label = view.attention_label || view.name
            const dot = view.attention_priority && PRIORITY_DOT[view.attention_priority]
              ? PRIORITY_DOT[view.attention_priority]
              : 'bg-primary'
            return (
              <Link
                key={view.id}
                href={href}
                className="group flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-card hover:bg-surface-1 transition-colors"
                title={view.name}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dot)}
                  style={view.attention_color ? { backgroundColor: view.attention_color } : undefined}
                />
                <span className="flex-1 text-sm text-foreground truncate group-hover:text-primary">{label}</span>
                <span className="text-2xs px-1.5 py-0.5 rounded-full bg-surface-2 text-foreground tabular-nums">
                  {count}
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </Link>
            )
          })}
        </div>
      )}

      {hasStale && (
        <div className="space-y-1">
          {hasViews && (
            <p className="text-2xs uppercase tracking-wider text-muted-foreground pt-1 flex items-center gap-1">
              <Flame className="w-3 h-3" />
              Stale records
            </p>
          )}
          {staleRecords.map(r => (
            <Link
              key={r.id}
              href={`/boards/${r.board_id}`}
              className="block px-3 py-2 rounded-lg border border-border bg-card hover:bg-surface-1 transition-colors group"
            >
              <p className="text-sm text-foreground truncate group-hover:text-primary">{r.title}</p>
              <p className="text-2xs text-muted-foreground mt-0.5">
                Last touched {relativeDays(r.updated_at)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function relativeDays(updatedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
  if (diff < 1) return 'today'
  if (diff < 2) return '1 day ago'
  return `${diff} days ago`
}
