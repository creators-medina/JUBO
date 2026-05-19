import { Flame, Trophy, Sunrise } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StreakData, DayStatus } from '../progress/streaks'

export function StreakCard({ data }: { data: StreakData }) {
  if (!data.hasHistory) {
    return (
      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground">Streak</p>
          <Flame className="w-3 h-3 text-muted-foreground" />
        </div>
        <p className="text-xl font-semibold text-foreground tabular-nums">—</p>
        <p className="text-2xs text-muted-foreground truncate">Not enough history yet</p>
      </div>
    )
  }

  const message = streakMessage(data)
  const accent  = streakAccent(data)

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">Streak</p>
        <span className={cn('w-6 h-6 rounded-md flex items-center justify-center', accent.bg)}>
          <Flame className={cn('w-3 h-3', accent.text)} />
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        <p className={cn('text-xl font-semibold tabular-nums', accent.text)}>
          {data.currentStreak}
        </p>
        <p className="text-2xs text-muted-foreground">day{data.currentStreak === 1 ? '' : 's'}</p>
      </div>

      <p className="text-2xs text-muted-foreground truncate" title={message}>
        {message}
      </p>

      {data.bestStreak > data.currentStreak && (
        <div className="flex items-center gap-1 text-2xs text-muted-foreground">
          <Trophy className="w-2.5 h-2.5" />
          <span>Best: {data.bestStreak}d</span>
        </div>
      )}
    </div>
  )
}

function streakMessage(data: StreakData): string {
  if (data.todayStatus === 'won') {
    return data.currentStreak > 1
      ? `${data.currentStreak}-day streak — keep it going.`
      : "Today is locked in."
  }
  if (data.todayStatus === 'rest') {
    return 'Rest day — streak preserved.'
  }
  if (data.actionsToWin === 0 && data.todayTarget === 0) {
    return 'Plan your day to start a streak.'
  }
  if (data.actionsToWin === 1) return "1 more action to win the day."
  if (data.actionsToWin > 1)   return `${data.actionsToWin} more actions to win the day.`
  return "Almost there — keep going."
}

function streakAccent(data: StreakData): { bg: string; text: string } {
  if (data.todayStatus === 'won')     return { bg: 'bg-emerald-500/15', text: 'text-emerald-400' }
  if (data.currentStreak >= 7)        return { bg: 'bg-amber-500/15',   text: 'text-amber-400' }
  if (data.actionsToWin > 0 && data.actionsToWin <= 2)
                                      return { bg: 'bg-amber-500/15',   text: 'text-amber-400' }
  return                                       { bg: 'bg-surface-2',     text: 'text-muted-foreground' }
}

// Re-exported so widgets can use the same icon-mapping helpers if needed
export function dayStatusIcon(status: DayStatus): React.ElementType {
  if (status === 'won')  return Flame
  if (status === 'rest') return Sunrise
  return Sunrise
}
