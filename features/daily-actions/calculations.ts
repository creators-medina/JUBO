// Daily-actions pure calculations. No DB access.

import type { DailyActionRow, DailyMetricPace, DailyProgressStatus, TodaySummary } from './types'

export function todayISO(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function isOverdue(action: DailyActionRow, today: string = todayISO()): boolean {
  return action.completed_at === null && action.due_date < today
}

export function isOpen(action: DailyActionRow): boolean {
  return action.completed_at === null
}

export function isCompleted(action: DailyActionRow): boolean {
  return action.completed_at !== null
}

/**
 * Translate a pace_percent value into a discrete status bucket.
 * The thresholds match the rest of the goal engine (≥100 on/ahead, ≥85 watch, else behind).
 */
export function paceStatus(pacePercent: number, hasData: boolean): DailyProgressStatus {
  if (!hasData) return 'unknown'
  if (pacePercent >= 110) return 'ahead'
  if (pacePercent >= 90)  return 'on_pace'
  return 'behind'
}

/** Roll up an array of per-metric paces into a single status for the day. */
export function overallPaceStatus(paces: Array<Pick<DailyMetricPace, 'status'>>): DailyProgressStatus {
  if (paces.length === 0) return 'unknown'
  const anyBehind  = paces.some(p => p.status === 'behind')
  const anyUnknown = paces.some(p => p.status === 'unknown')
  const allAhead   = paces.every(p => p.status === 'ahead')
  if (anyBehind) return 'behind'
  if (allAhead)  return 'ahead'
  if (anyUnknown) return 'unknown'
  return 'on_pace'
}

/** Human label for the header status line. */
export function paceSentence(summary: { overdue: number; open: number; paceStatus: DailyProgressStatus }): string {
  if (summary.overdue > 0) {
    return summary.overdue === 1
      ? "You have 1 overdue action — clear it first."
      : `You have ${summary.overdue} overdue actions — clear them first.`
  }
  if (summary.paceStatus === 'behind') {
    return summary.open > 0
      ? `Behind pace — ${summary.open} action${summary.open === 1 ? '' : 's'} left today.`
      : 'Behind pace — add focus actions.'
  }
  if (summary.paceStatus === 'ahead')   return "Ahead of pace. Keep building."
  if (summary.paceStatus === 'on_pace') return summary.open > 0 ? "On pace — finish your list to lock it in." : "On pace — and your list is clear."
  return summary.open > 0 ? "Focus on follow-ups today." : "No actions yet. Plan your day."
}

/** Aggregate today's open/completed/overdue counts. */
export function summarizeDay(
  actions: DailyActionRow[],
  paceStatus: DailyProgressStatus,
  today: string = todayISO(),
): TodaySummary {
  const dueToday = actions.filter(a => a.due_date <= today)
  const completed = dueToday.filter(isCompleted).length
  const open = dueToday.filter(isOpen).length
  const overdue = actions.filter(a => isOverdue(a, today)).length
  const summary = {
    date: today,
    total: dueToday.length,
    completed,
    open,
    overdue,
    paceStatus,
    paceLabel: '',
  }
  summary.paceLabel = paceSentence(summary)
  return summary
}
