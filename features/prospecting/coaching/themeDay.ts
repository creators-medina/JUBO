// ─────────────────────────────────────────────────────────────────────────
// Theme days — the Lender Theme Days weekly call rhythm. Monday–Friday each
// carry a call theme, a contact bucket, and concise guidance from the Lender
// Theme Days playbook. Config-driven (not in the engine core); editable here.
// Weekend days remain light prep/catch-up themes with no call bucket.
// ─────────────────────────────────────────────────────────────────────────

import type { ThemeBucketKey } from '../themeBuckets'

export type ThemeDay = {
  key: string
  label: string
  /** Compact name for tight UI (week strip cards). */
  shortLabel: string
  blurb: string
  /** A coaching-oriented line: what today means and why it matters. */
  coaching: string
  /** board slug the queue should weight toward today (or null for general) */
  boardSlug: string | null
  /** Theme-day contact bucket (null on weekend prep days). */
  bucket: ThemeBucketKey | null
  /** Human label for the bucket, e.g. "Realtor / Agent contacts". */
  bucketLabel: string | null
  /** Concise playbook guidance for the day (kept short — not a wall of text). */
  guidance: string[]
  /** Label for the empty/low-bucket "add more" action. */
  addLabel: string | null
}

// Keyed by JS weekday (0 = Sunday … 6 = Saturday).
const THEME_DAYS: Record<number, ThemeDay> = {
  1: {
    key: 'realtor_monday', label: 'Realtor Calls', shortLabel: 'Realtor Calls', blurb: 'Call your qualified real estate agents.',
    coaching: 'Agents feed your pipeline. Work your qualified agent list today — every conversation is future business.',
    boardSlug: 'realtors-partners', bucket: 'realtors', bucketLabel: 'Realtor / Agent contacts',
    guidance: [
      'Call your qualified agent list',
      'Run birthday program: cards, food, gifts',
      'Categorize agents A/B/C',
      'Ask for the business',
    ],
    addLabel: 'Add more Realtor / Agent contacts',
  },
  2: {
    key: 'status_tuesday', label: 'Status Calls', shortLabel: 'Status Calls', blurb: 'Update every stakeholder on active files.',
    coaching: 'Status calls keep deals alive and referrals flowing. Touch every active file: buyer, agents, title.',
    boardSlug: 'loan-pipeline', bucket: 'status', bucketLabel: 'Active loan files',
    guidance: [
      'Update the buyer, both agents, and title/escrow',
      'Ask for referrals and the business',
      'Revive stalled and inactive files',
      'Send a closing gift for every file',
    ],
    addLabel: 'Add active loan files',
  },
  3: {
    key: 'preapp_wednesday', label: 'Pre-Apps', shortLabel: 'Pre-Apps', blurb: 'Work your pre-approved and application pipeline.',
    coaching: 'Pre-approved buyers go cold without contact. Call, email, and keep every file current.',
    boardSlug: null, bucket: 'preapps', bucketLabel: 'Pre-App / Pre-Approval contacts',
    guidance: [
      'Call, email, and send a video',
      'Update every file at least every 60 days',
      'Ask for the business',
    ],
    addLabel: 'Add Pre-App contacts',
  },
  4: {
    key: 'pastclient_thursday', label: 'Past Clients', shortLabel: 'Past Clients', blurb: 'Reconnect with your past client database.',
    coaching: 'Your past clients are your warmest market. One check-in today can open repeat business and referrals.',
    boardSlug: 'past-clients', bucket: 'pastclients', bucketLabel: 'Past clients',
    guidance: [
      'Work the past-client database',
      'Call one letter/section per week',
      'Touch every client twice per year',
      'Invite to annual client appreciation event',
    ],
    addLabel: 'Add Past Clients',
  },
  5: {
    key: 'vip_friday', label: 'VIPs / Favorite People', shortLabel: 'VIPs', blurb: 'Invest in your most influential relationships.',
    coaching: 'Your VIP list compounds. Call 25% of it every week and keep adding the people who move your business.',
    boardSlug: null, bucket: 'vips', bucketLabel: 'VIPs / favorite people',
    guidance: [
      'Call the most influential people in your life',
      'Call about 25% each week · meet 2 per month',
      'Add people to the database',
      'Run birthday program · ask for the business',
    ],
    addLabel: 'Add VIPs',
  },
  6: {
    key: 'catchup_saturday', label: 'Catch-Up Saturday', shortLabel: 'Catch-Up', blurb: 'Tidy the pipeline and tee up next week.',
    coaching: 'A focused hour today buys a fast start Monday. Tidy the pipeline and line up your best opportunities.',
    boardSlug: null, bucket: null, bucketLabel: null, guidance: [], addLabel: null,
  },
  0: {
    key: 'prep_sunday', label: 'Prep Sunday', shortLabel: 'Prep', blurb: 'Plan your week and clear quick wins.',
    coaching: 'Plan the week before it starts. Clear a few quick wins so you walk into Monday with momentum.',
    boardSlug: null, bucket: null, bucketLabel: null, guidance: [], addLabel: null,
  },
}

export function getThemeDay(date = new Date()): ThemeDay {
  return THEME_DAYS[date.getDay()]
}

export function getThemeDayFor(weekday: number): ThemeDay {
  return THEME_DAYS[weekday] ?? THEME_DAYS[1]
}

/** Monday–Friday of the current week, each with its date (for the week strip). */
export function getWeekThemeDays(now = new Date()): { weekday: number; date: Date; theme: ThemeDay }[] {
  const monday = new Date(now)
  const dow = now.getDay()
  // Roll back to Monday of the current week (Sunday shows the coming week).
  monday.setDate(now.getDate() - (dow === 0 ? -1 : dow - 1))
  return [1, 2, 3, 4, 5].map((weekday, i) => {
    const date = new Date(monday)
    date.setDate(monday.getDate() + i)
    return { weekday, date, theme: THEME_DAYS[weekday] }
  })
}
