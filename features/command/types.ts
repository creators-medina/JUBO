// Command palette / global search type system.
//
// Every searchable thing (records, boards, dashboards, goals, saved views,
// open workspace tabs) and every executable action (Create Record, Open
// Today, etc.) flows through one CommandItem shape. Providers are pure —
// they return arrays of CommandItem; UI groups them and lets the user pick.

export type CommandItemType =
  | 'record'
  | 'board'
  | 'dashboard'
  | 'goal'
  | 'saved_view'
  | 'task'
  | 'workspace_tab'
  | 'action'
  | 'recent'

export type CommandItem = {
  id: string                              // stable key, e.g. "record:<uuid>"
  type: CommandItemType
  title: string
  subtitle?: string                       // breadcrumb / second line ("Board · Active Leads")
  iconName?: string                       // lucide icon name — kept stringly typed so the registry stays serializable
  keywords?: string[]                     // extra fuzzy-search terms (slug, status, etc.)
  groupLabel: string                      // "Records" / "Boards" / "Quick Actions" / "Recently Opened"
  metadata?: Record<string, unknown>      // free-form for ranking + dedupe
  score?: number                          // populated by the ranker; higher = better
  preview?: string                        // right-aligned current-value hint ("High", "Active")
  // Behaviour — exactly one of these
  onSelect?: () => void                   // imperative (open workspace, run action)
  href?: string                           // navigate via router
  intoPage?: CommandPage                  // chained flow — selecting navigates into a sub-page
}

// ── Chained command pages ─────────────────────────────────────────────────
//
// A command can navigate INTO a page instead of executing immediately. Two
// shapes: a `list` page (pick a target — group, priority, status) or an
// `input` page (type a value — note body, task title, next action). This is
// the foundation for keyboard-driven multi-step flows and, later, AI dialogs.

export type CommandListPage = {
  kind: 'list'
  title: string
  placeholder?: string
  loadItems: () => CommandItem[] | Promise<CommandItem[]>
}

export type CommandInputPage = {
  kind: 'input'
  title: string
  placeholder?: string
  submitLabel?: string
  multiline?: boolean
  initialValue?: string
  onSubmit: (value: string) => void | Promise<void>
}

export type CommandPage = CommandListPage | CommandInputPage

// ── Contextual command context ─────────────────────────────────────────────
//
// What the active workspace exposes so contextualCommands() can build
// record-aware actions. Generic — no entity-specific assumptions.

export type ActiveRecordContext = {
  recordId: string
  title: string
  boardId: string
  groupId: string | null
  status: string
  priority: string
  value: number | null
  nextAction: string | null
  nextActionDueAt: string | null
  nextActionCompletedAt: string | null
  organizationId: string
  groups: Array<{ id: string; name: string; color: string | null }>
  activeSubTab?: string
}

// ── Command history ────────────────────────────────────────────────────────

export type CommandHistoryEntry = {
  commandId: string                       // e.g. "ctx:move-stage" / "action:open-today"
  title: string
  iconName?: string
  executedAt: number
  count: number                           // frequency for ranking boosts
}

export type SearchContext = {
  organizationId: string
  query: string
  openRecordIds: string[]                 // for "already open" hinting
  recentRecordIds: string[]               // for recency boosting
}

export type SearchProvider = (ctx: SearchContext) => Promise<CommandItem[]>

// ── Recent history ──────────────────────────────────────────────────────────

export type RecentItemKind = 'record' | 'board' | 'dashboard' | 'goal' | 'workspace_tab'

export type RecentItem = {
  kind: RecentItemKind
  id: string
  title: string
  subtitle?: string
  iconName?: string
  href?: string
  openedAt: number                        // epoch ms
  metadata?: Record<string, unknown>
}

// ── Ranking weights — exported so future AI can tune ───────────────────────

export const TYPE_WEIGHT: Record<CommandItemType, number> = {
  workspace_tab: 100,                     // already-open trumps everything
  recent:        80,
  record:        60,
  board:         55,
  dashboard:     50,
  saved_view:    45,
  goal:          40,
  task:          35,
  action:        30,
}

export const RECENT_BOOST = 25
export const OPEN_TAB_BOOST = 40
export const EXACT_MATCH = 100
export const PREFIX_MATCH = 70
export const CONTAINS_MATCH = 40
export const FUZZY_BASE = 20
