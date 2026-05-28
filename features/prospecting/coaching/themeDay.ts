// ─────────────────────────────────────────────────────────────────────────
// Theme day — a rotating daily focus that flavors coaching copy and nudges the
// queue toward a board. Config-driven (not in the engine core); editable here.
// ─────────────────────────────────────────────────────────────────────────

export type ThemeDay = {
  key: string
  label: string
  blurb: string
  /** board slug the queue should weight toward today (or null for general) */
  boardSlug: string | null
}

// Keyed by JS weekday (0 = Sunday … 6 = Saturday).
const THEME_DAYS: Record<number, ThemeDay> = {
  1: { key: 'momentum_monday',  label: 'Momentum Monday',     blurb: 'Set the tone — work your freshest leads first.',        boardSlug: 'active-leads' },
  2: { key: 'partner_tuesday',  label: 'Partner Tuesday',     blurb: 'Invest in referral relationships today.',               boardSlug: 'realtors-partners' },
  3: { key: 'warm_wednesday',   label: 'Warm Lead Wednesday', blurb: 'Re-engage warm leads before they cool.',                boardSlug: 'active-leads' },
  4: { key: 'throwback_thursday', label: 'Throwback Thursday', blurb: 'Reconnect with past clients — repeat & referrals.',    boardSlug: 'past-clients' },
  5: { key: 'followup_friday',  label: 'Follow-Up Friday',    blurb: 'Close the loop on every open follow-up.',               boardSlug: null },
  6: { key: 'catchup_saturday', label: 'Catch-Up Saturday',   blurb: 'Tidy the pipeline and tee up next week.',               boardSlug: null },
  0: { key: 'prep_sunday',      label: 'Prep Sunday',         blurb: 'Plan your week and clear quick wins.',                  boardSlug: null },
}

export function getThemeDay(date = new Date()): ThemeDay {
  return THEME_DAYS[date.getDay()]
}
