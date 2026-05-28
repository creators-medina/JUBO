// ─────────────────────────────────────────────────────────────────────────
// Daily coaching — turns the existing pacing + attention + activity numbers
// into a short, motivating performance read. Pure: no new data, just synthesis.
// ─────────────────────────────────────────────────────────────────────────

export type CoachTone = 'good' | 'warn' | 'urgent' | 'info'
export type CoachLine = { text: string; tone: CoachTone; icon: string }

type PaceLite = { goal_name: string; status: string; pace_percent: number; daily_target?: number }
type AttentionLite = { count: number }
type SummaryLite = { total: number; completed: number; open: number; paceStatus: string }

export function buildCoaching(input: {
  summary: SummaryLite
  paces: PaceLite[]
  staleCount: number
  attentionViews: AttentionLite[]
  followUpsDue?: number
}): CoachLine[] {
  const lines: CoachLine[] = []
  const { summary, paces, staleCount, attentionViews, followUpsDue = 0 } = input

  // 1. Headline pace read.
  const behind = paces.filter((p) => p.status === 'behind')
  const ahead = paces.filter((p) => p.status === 'ahead')
  if (behind.length > 0) {
    const g = behind[0]
    lines.push({ tone: 'urgent', icon: 'TrendingDown', text: `You're behind on ${g.goal_name} — let's close the gap today.` })
  } else if (ahead.length > 0) {
    lines.push({ tone: 'good', icon: 'TrendingUp', text: `You're ahead on ${ahead[0].goal_name}. Keep the momentum.` })
  } else if (paces.length > 0) {
    lines.push({ tone: 'info', icon: 'Target', text: `On pace across ${paces.length} goal${paces.length === 1 ? '' : 's'} — stay consistent.` })
  }

  // 2. Follow-ups due from logged communication.
  if (followUpsDue > 0) {
    lines.push({ tone: 'warn', icon: 'CalendarClock', text: `You have ${followUpsDue} follow-up${followUpsDue === 1 ? '' : 's'} due from recent calls.` })
  }

  // 3. Attention load.
  const attention = attentionViews.reduce((n, v) => n + (v.count ?? 0), 0)
  if (attention > 0) {
    lines.push({ tone: 'warn', icon: 'AlertTriangle', text: `${attention} item${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention.` })
  }

  // 3. Quiet relationships.
  if (staleCount > 0) {
    lines.push({ tone: 'warn', icon: 'PhoneOff', text: `${staleCount} record${staleCount === 1 ? '' : 's'} ha${staleCount === 1 ? 's' : 've'} gone quiet — reach out.` })
  }

  // 4. Today's execution.
  if (summary.open > 0) {
    lines.push({ tone: 'info', icon: 'ListChecks', text: `${summary.open} action${summary.open === 1 ? '' : 's'} left to win the day.` })
  } else if (summary.total > 0) {
    lines.push({ tone: 'good', icon: 'CheckCheck', text: `All ${summary.total} actions done. Strong day.` })
  }

  return lines.slice(0, 4)
}
