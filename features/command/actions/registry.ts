'use client'

// Quick-action command registry. Pure data — entries get hydrated with their
// runtime handlers by the CommandPalette at render time (because handlers need
// the router + workspace context). This stays a flat list so future AI agents
// can introspect / extend it without untangling switch statements.

import type { CommandItem } from '../types'

export type QuickActionId =
  | 'open-today'
  | 'open-goals'
  | 'open-boards'
  | 'open-dashboard-hub'
  | 'open-forecasts'
  | 'open-integrations'
  | 'open-settings'
  | 'open-workflows'
  | 'open-prospecting'
  | 'open-prospecting-dashboard'
  | 'open-hot-leads'
  | 'start-prospecting-session'
  | 'end-prospecting-session'
  | 'log-booked-appointment'
  | 'log-interested'
  | 'log-not-interested'
  | 'resolve-followup'
  | 'run-workflow-scans'
  | 'resume-setup'
  | 'open-setup-checklist'
  | 'import-clients'
  | 'import-leads'
  | 'import-loans'
  | 'import-history'
  | 'new-import'
  | 'connect-integration'
  | 'connect-arive'
  | 'view-integration-events'
  | 'run-integration-worker'
  | 'open-stage-mapping'
  | 'schedule-followup'
  | 'log-connected-call'
  | 'log-no-answer'
  | 'log-email'
  | 'log-sms'
  | 'log-meeting'
  | 'customize-dashboard'
  | 'close-active-workspace'
  | 'close-all-workspaces'

export type QuickActionDef = {
  id: QuickActionId
  title: string
  subtitle?: string
  iconName: string
  keywords: string[]
  group: string
}

export const QUICK_ACTIONS: QuickActionDef[] = [
  // Navigation
  { id: 'open-today',          title: 'Go to Today',         iconName: 'Sunrise',         group: 'Navigate',    keywords: ['today', 'cockpit', 'win the day'] },
  { id: 'open-goals',          title: 'Go to Goals',         iconName: 'Target',          group: 'Navigate',    keywords: ['goals', 'funnel', 'pacing'] },
  { id: 'open-boards',         title: 'Go to Boards',        iconName: 'Columns3',        group: 'Navigate',    keywords: ['boards', 'records'] },
  { id: 'open-dashboard-hub',  title: 'Go to Dashboards',    iconName: 'LayoutDashboard', group: 'Navigate',    keywords: ['dashboard', 'widgets'] },
  { id: 'open-forecasts',      title: 'Go to Forecasts',     iconName: 'TrendingUp',      group: 'Navigate',    keywords: ['forecasts', 'projection'] },
  { id: 'open-integrations',   title: 'Go to Integrations',  iconName: 'Plug',            group: 'Navigate',    keywords: ['integrations', 'connections'] },
  { id: 'open-settings',       title: 'Go to Settings',      iconName: 'Settings',        group: 'Navigate',    keywords: ['settings', 'preferences'] },
  { id: 'open-workflows',      title: 'Manage Workflows',    iconName: 'Workflow',        group: 'Navigate',    keywords: ['workflows', 'automation', 'triggers'] },
  { id: 'open-prospecting',    title: 'Open Prospecting',    iconName: 'PhoneCall',       group: 'Navigate',    keywords: ['prospecting', 'calls', 'queue', 'cockpit', 'dial'] },
  { id: 'open-hot-leads',      title: 'Open Hot Leads',      iconName: 'Flame',           group: 'Navigate',    keywords: ['hot', 'leads', 'prospecting', 'queue', 'warm'] },
  { id: 'open-prospecting-dashboard', title: 'Open Prospecting Dashboard', iconName: 'LayoutDashboard', group: 'Navigate', keywords: ['prospecting', 'dashboard', 'widgets', 'performance'] },
  { id: 'start-prospecting-session', title: 'Start Call Session', iconName: 'Play',   group: 'System',      keywords: ['prospecting', 'session', 'calls', 'start', 'dial'] },
  { id: 'end-prospecting-session',   title: 'End Call Session',   iconName: 'Square', group: 'System',      keywords: ['prospecting', 'session', 'calls', 'end', 'stop'] },
  { id: 'log-booked-appointment', title: 'Log Booked Appointment', iconName: 'CalendarCheck', group: 'Record', keywords: ['log', 'booked', 'appointment', 'meeting', 'call'] },
  { id: 'log-interested',      title: 'Log Interested',       iconName: 'ThumbsUp',        group: 'Record',      keywords: ['log', 'interested', 'call', 'warm'] },
  { id: 'log-not-interested',  title: 'Log Not Interested',   iconName: 'ThumbsDown',      group: 'Record',      keywords: ['log', 'not interested', 'cold', 'call'] },
  { id: 'resolve-followup',    title: 'Resolve Follow-Up',    iconName: 'CheckCircle2',    group: 'Record',      keywords: ['resolve', 'follow up', 'followup', 'done', 'clear'] },
  { id: 'run-workflow-scans',  title: 'Run Workflow Scans',  iconName: 'RefreshCw',       group: 'System',      keywords: ['scan', 'stale', 'overdue', 'workflow', 'run'] },

  // Setup / onboarding
  { id: 'resume-setup',         title: 'Resume Setup',          iconName: 'Sparkles',        group: 'Setup',       keywords: ['setup', 'onboarding', 'resume', 'wizard'] },
  { id: 'open-setup-checklist', title: 'Open Setup Checklist',  iconName: 'ListChecks',      group: 'Setup',       keywords: ['checklist', 'activation', 'setup', 'progress'] },
  { id: 'new-import',           title: 'New Import',            iconName: 'Upload',          group: 'Import',      keywords: ['import', 'csv', 'xlsx', 'upload', 'data'] },
  { id: 'import-clients',       title: 'Import Clients',        iconName: 'Upload',          group: 'Import',      keywords: ['import', 'clients', 'csv', 'past clients'] },
  { id: 'import-leads',         title: 'Import Leads',          iconName: 'Upload',          group: 'Import',      keywords: ['import', 'leads', 'csv'] },
  { id: 'import-loans',         title: 'Import Loans',          iconName: 'Upload',          group: 'Import',      keywords: ['import', 'loans', 'pipeline', 'csv'] },
  { id: 'import-history',       title: 'View Import History',   iconName: 'ListChecks',      group: 'Import',      keywords: ['import', 'history', 'audit', 'retry'] },
  { id: 'connect-integration',  title: 'Connect Integration',   iconName: 'Plug',            group: 'Setup',       keywords: ['integration', 'connect', 'sync'] },
  { id: 'connect-arive',        title: 'Connect Arive',         iconName: 'Plug',            group: 'Setup',       keywords: ['arive', 'zapier', 'connect', 'webhook', 'sync'] },
  { id: 'view-integration-events', title: 'View Integration Events', iconName: 'Activity',   group: 'Setup',       keywords: ['integration', 'events', 'webhook', 'log', 'sync'] },
  { id: 'run-integration-worker',  title: 'Process Integration Events', iconName: 'RefreshCw', group: 'System',    keywords: ['integration', 'worker', 'sync', 'process', 'drain', 'pending', 'arive'] },
  { id: 'open-stage-mapping',      title: 'Open Stage Mapping',    iconName: 'GitBranch',       group: 'Setup',       keywords: ['stage', 'mapping', 'pipeline', 'status', 'movement', 'integration'] },
  { id: 'customize-dashboard',  title: 'Customize Dashboard',   iconName: 'LayoutDashboard', group: 'Setup',       keywords: ['customize', 'dashboard', 'widgets'] },

  // Record operations (act on the open workspace record)
  { id: 'schedule-followup',    title: 'Schedule Follow-Up',    iconName: 'Clock',           group: 'Record',      keywords: ['follow up', 'followup', 'next action', 'remind', 'schedule'] },
  { id: 'log-connected-call',   title: 'Log Connected Call',    iconName: 'Phone',           group: 'Record',      keywords: ['log', 'call', 'connected', 'communication'] },
  { id: 'log-no-answer',        title: 'Log No Answer',         iconName: 'PhoneOff',        group: 'Record',      keywords: ['log', 'call', 'no answer', 'missed'] },
  { id: 'log-email',            title: 'Log Email',             iconName: 'Mail',            group: 'Record',      keywords: ['log', 'email', 'communication'] },
  { id: 'log-sms',              title: 'Log SMS',               iconName: 'MessageSquare',   group: 'Record',      keywords: ['log', 'sms', 'text', 'communication'] },
  { id: 'log-meeting',          title: 'Log Meeting',           iconName: 'Calendar',        group: 'Record',      keywords: ['log', 'meeting', 'communication'] },

  // Workspace controls
  { id: 'close-active-workspace', title: 'Close Active Workspace', iconName: 'X',         group: 'Workspace',   keywords: ['close', 'esc'] },
  { id: 'close-all-workspaces',   title: 'Close All Workspaces',   iconName: 'XCircle',   group: 'Workspace',   keywords: ['close all', 'reset'] },
]

/**
 * Turn the static defs into renderable CommandItems for the palette.
 * Handler is injected at the call site so the registry stays serializable.
 */
export function getQuickActionItems(
  resolve: (id: QuickActionId) => (() => void) | undefined,
): CommandItem[] {
  const out: CommandItem[] = []
  for (const a of QUICK_ACTIONS) {
    const handler = resolve(a.id)
    if (!handler) continue
    out.push({
      id:         `action:${a.id}`,
      type:       'action',
      title:      a.title,
      subtitle:   a.subtitle,
      iconName:   a.iconName,
      keywords:   a.keywords,
      groupLabel: a.group,
      onSelect:   handler,
    })
  }
  return out
}

// ── Contextual command hook (Phase 12 foundation; expanded later) ──────────
//
// `contextualCommands(record)` returns commands relevant to a given record —
// e.g. "Move record to stage", "Assign owner", "Schedule call". Phase 12 only
// stubs the shape; future phases register handlers through the same pipeline
// the static QUICK_ACTIONS use, so AI/automation can target the same surface.

export type ContextualCommand = CommandItem

export function contextualCommands(_record: { id: string; title: string } | null): ContextualCommand[] {
  // Intentional foundation-only. Returns empty until Phase 13+ wires up
  // record-aware actions (move/assign/schedule/etc).
  return []
}
