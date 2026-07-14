// ─────────────────────────────────────────────────────────────────────────
// Phase 39A — Prospecting schedule types.
//
// A user-editable weekly plan for which board(s) the call queue pulls from on
// each weekday. The queue's smart scoring still ranks *within* the chosen pool;
// the schedule only decides which pool. Pure types + helpers (no server imports)
// so client components can share them.
// ─────────────────────────────────────────────────────────────────────────

/** How a given weekday sources its queue. */
export type DayMode =
  | 'any'    // score across all boards (legacy behavior)
  | 'boards' // pull only from the chosen board(s)
  | 'off'    // no prospecting queue this day

export type DaySchedule = {
  mode: DayMode
  /** Board IDs to pull from when mode === 'boards'. Ignored otherwise. */
  boardIds: string[]
  /** Optional per-day call target — used as the backfill floor. */
  target: number | null
}

/** Keyed by JS weekday: 0 = Sunday … 6 = Saturday. */
export type WeekSchedule = Record<number, DaySchedule>

export type ProspectingSchedule = {
  /** Master switch — when false the queue ignores the schedule (legacy). */
  enabled: boolean
  /** When true, only scheduled boards are surfaced (no backfill from others). */
  strict: boolean
  week: WeekSchedule
}

export const WEEKDAY_LABELS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function emptyDaySchedule(): DaySchedule {
  return { mode: 'any', boardIds: [], target: null }
}

export function defaultWeek(): WeekSchedule {
  const w: WeekSchedule = {}
  for (let d = 0; d < 7; d++) w[d] = emptyDaySchedule()
  return w
}

export function defaultSchedule(): ProspectingSchedule {
  return { enabled: false, strict: false, week: defaultWeek() }
}

/** The effective day plan for a given date (falls back to 'any'). */
export function dayScheduleFor(schedule: ProspectingSchedule, date: Date): DaySchedule {
  return schedule.week[date.getDay()] ?? emptyDaySchedule()
}

// ── Defensive normalization ────────────────────────────────────────────────
// The `week` column is free-form JSONB; coerce anything into a well-formed
// schedule so a bad/partial blob can never crash the queue.

function normalizeDay(raw: unknown): DaySchedule {
  const r = (raw ?? {}) as Record<string, unknown>
  const mode: DayMode = r.mode === 'boards' || r.mode === 'off' ? r.mode : 'any'
  const boardIds = Array.isArray(r.boardIds)
    ? r.boardIds.filter((x): x is string => typeof x === 'string')
    : []
  const t = typeof r.target === 'number' && Number.isFinite(r.target) && r.target > 0
    ? Math.floor(r.target)
    : null
  return { mode, boardIds: mode === 'boards' ? boardIds : [], target: t }
}

export function normalizeSchedule(raw: unknown): ProspectingSchedule {
  const r = (raw ?? {}) as Record<string, unknown>
  const weekRaw = (r.week ?? {}) as Record<string, unknown>
  const week: WeekSchedule = {}
  for (let d = 0; d < 7; d++) week[d] = normalizeDay(weekRaw[String(d)] ?? weekRaw[d])
  return {
    enabled: r.enabled !== false, // default true; only an explicit false disables
    strict: r.strict === true,
    week,
  }
}
