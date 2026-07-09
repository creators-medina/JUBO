// ─────────────────────────────────────────────────────────────────────────
// localStorage key registry (operator-audit quick win #7).
//
// One place that knows every Jubo per-browser preference key, so versions
// and formats stop sprawling across components. These builders wrap the
// EXISTING key formats byte-for-byte — nothing is renamed or migrated, so
// every user's saved state keeps working.
//
// Older keys not yet routed through here (documented for the map):
//   jubo-sidebar-nav-layout:v1 · jubo-sidebar-section-overrides:v1 ·
//   jubo-theme-day-reset:v1:<date> · per-slot/label sidebar keys.
// Route them through this registry opportunistically when their owning
// components are next touched.
// ─────────────────────────────────────────────────────────────────────────

const scope = (userId: string | null | undefined) => userId || 'local'

export const LOCAL_KEYS = {
  /** Manual Greatness Tracker weekly values (per user + week's Monday date). */
  greatnessValues: (userId: string | null | undefined, mondayKey: string) =>
    `jubo-greatness-tracker:v1:${scope(userId)}:${mondayKey}`,
  /** Manual Greatness Tracker collapsed/expanded preference. */
  greatnessCollapsed: (userId: string | null | undefined) =>
    `jubo-greatness-tracker:v1:${scope(userId)}:collapsed`,
  /** Manual vs Verified card collapsed/expanded preference. */
  manualVsVerifiedCollapsed: 'jubo-manual-vs-verified:v1:collapsed',
  /** Verified Results reporting section collapsed/expanded preference. */
  verifiedResultsCollapsed: 'jubo-verified-results:v1:collapsed',
  /** Last-used board view mode (per user + board). */
  boardViewMode: (userId: string | null | undefined, boardId: string) =>
    `jubo-board-view-mode:v1:${scope(userId)}:${boardId}`,
  /** One-time UI hints (seen flags). */
  hintCrossBoardDrag: 'jubo-hint-crossboard-drag:v1',
  /** Contact Card trifold (Layout 4a) — per user + record layout preferences. */
  contactCardLeftCollapsed: (userId: string | null | undefined, recordId: string) =>
    `jubo-contact-card:v1:${scope(userId)}:${recordId}:left-collapsed`,
  contactCardRightCollapsed: (userId: string | null | undefined, recordId: string) =>
    `jubo-contact-card:v1:${scope(userId)}:${recordId}:right-collapsed`,
  contactCardHubSection: (userId: string | null | undefined, recordId: string) =>
    `jubo-contact-card:v1:${scope(userId)}:${recordId}:hub-section`,
  contactCardSideTab: (userId: string | null | undefined, recordId: string) =>
    `jubo-contact-card:v1:${scope(userId)}:${recordId}:side-tab`,
} as const
