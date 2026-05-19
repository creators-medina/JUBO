// Streak engine — reads `daily_progress` rows for the current user and
// computes a current/best streak based on the daily completion rule.
//
// Rule (Phase 10):
//   A day is "won" when EITHER:
//     • actions_completed / actions_target >= 0.8 (with target > 0), OR
//     • actions_target == 0 (no obligations that day → not penalized)
//   Days with completed urgent actions count toward the streak boost too,
//   but the primary rule above keeps it simple to read.
//
// We pull the last N days of daily_progress for actions_target +
// actions_completed, walk backwards from today/yesterday, and count
// consecutive wins.

import { createClient } from '@/lib/supabase/server'
import { todayISO } from '../calculations'

export type DayStatus = 'won' | 'lost' | 'pending' | 'rest'

export type StreakData = {
  currentStreak: number
  bestStreak: number
  todayStatus: DayStatus            // pending until end of day or until threshold met
  yesterdayStatus: DayStatus
  todayProgressPct: number          // 0..100 (today's completed/target × 100)
  todayTarget: number
  todayCompleted: number
  actionsToWin: number              // how many more completes needed today to "win" the day
  hasHistory: boolean               // false → render empty state
}

const WIN_THRESHOLD = 0.8

/** Classify a single day given target + completed counts. */
function classifyDay(target: number, completed: number, isToday: boolean): DayStatus {
  if (target === 0) return 'rest'
  const ratio = completed / target
  if (ratio >= WIN_THRESHOLD) return 'won'
  return isToday ? 'pending' : 'lost'
}

/** Count consecutive wins (+ rest days) going backwards from `fromIdx`. */
function countConsecutive(daySeries: Array<{ date: string; status: DayStatus }>, fromIdx: number): number {
  let streak = 0
  for (let i = fromIdx; i >= 0; i--) {
    const s = daySeries[i].status
    if (s === 'won' || s === 'rest') streak += s === 'won' ? 1 : 0
    else break
    if (s === 'rest' && streak === 0) {
      // a leading rest day doesn't extend a non-existent streak, but it
      // also doesn't break one — keep walking back
      continue
    }
  }
  return streak
}

export async function getStreakData(userId: string, today: string = todayISO()): Promise<StreakData> {
  const supabase = await createClient()

  const lookbackDays = 60
  const start = new Date(today + 'T00:00:00Z')
  start.setUTCDate(start.getUTCDate() - lookbackDays)
  const startISO = start.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('daily_progress')
    .select('date, metric_key, actual_value, target_value')
    .eq('user_id', userId)
    .in('metric_key', ['actions_target', 'actions_completed'])
    .gte('date', startISO)
    .lte('date', today)
    .order('date', { ascending: true })

  const rows = data ?? []

  // Aggregate per date → { target, completed }
  type DayAgg = { target: number; completed: number }
  const byDate = new Map<string, DayAgg>()
  for (const r of rows) {
    const cur = byDate.get(r.date) ?? { target: 0, completed: 0 }
    if (r.metric_key === 'actions_target')    cur.target    = Number(r.actual_value)
    if (r.metric_key === 'actions_completed') cur.completed = Number(r.actual_value)
    byDate.set(r.date, cur)
  }

  if (byDate.size === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      todayStatus: 'pending',
      yesterdayStatus: 'pending',
      todayProgressPct: 0,
      todayTarget: 0,
      todayCompleted: 0,
      actionsToWin: 0,
      hasHistory: false,
    }
  }

  // Build the day series in ascending order, oldest → today
  const allDates = Array.from(byDate.keys()).sort()
  const series = allDates.map(date => {
    const agg = byDate.get(date)!
    return {
      date,
      target: agg.target,
      completed: agg.completed,
      status: classifyDay(agg.target, agg.completed, date === today),
    }
  })

  // Today / yesterday slots
  const todaySlot = series.find(s => s.date === today)
  const yesterdayDate = (() => {
    const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  })()
  const yesterdaySlot = series.find(s => s.date === yesterdayDate)

  const todayTarget    = todaySlot?.target    ?? 0
  const todayCompleted = todaySlot?.completed ?? 0
  const todayProgressPct = todayTarget > 0 ? (todayCompleted / todayTarget) * 100 : 0
  const actionsToWin = todayTarget > 0
    ? Math.max(0, Math.ceil(todayTarget * WIN_THRESHOLD) - todayCompleted)
    : 0

  // Current streak: count consecutive (won OR rest), going back from the day
  // BEFORE today (so today doesn't end the streak just because it's pending).
  // If today is already a win, include it.
  let walkFromIdx = series.length - 1
  if (todaySlot && todaySlot.status === 'pending') {
    walkFromIdx -= 1
  }
  let currentStreak = 0
  for (let i = walkFromIdx; i >= 0; i--) {
    const s = series[i].status
    if (s === 'won') currentStreak += 1
    else if (s === 'rest') continue   // skip rest days without resetting
    else break
  }
  // Add today if won
  if (todaySlot?.status === 'won') {
    if (walkFromIdx < series.length - 1) {
      // we already excluded today above; re-add
      currentStreak += 1
    }
  }

  // Best streak: walk forward, track longest run of wins (rest days don't break it)
  let bestStreak = 0
  let run = 0
  for (const s of series) {
    if (s.status === 'won') { run += 1; bestStreak = Math.max(bestStreak, run) }
    else if (s.status === 'rest') continue
    else run = 0
  }
  bestStreak = Math.max(bestStreak, currentStreak)

  return {
    currentStreak,
    bestStreak,
    todayStatus: todaySlot?.status ?? 'pending',
    yesterdayStatus: yesterdaySlot?.status ?? 'pending',
    todayProgressPct,
    todayTarget,
    todayCompleted,
    actionsToWin,
    hasHistory: true,
  }
}
