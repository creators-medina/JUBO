// ─────────────────────────────────────────────────────────────────────────
// Phase 23 — Prospecting dashboard widget configs + data shapes.
// Surfaces the same metrics the cockpit uses, on any dashboard.
// ─────────────────────────────────────────────────────────────────────────

import type { LeadTemperature } from '../types'
import type { CallTargetSource } from '../target'
import type { FollowUpDueItem } from '@/features/communications/queries'

export type { FollowUpDueItem }

// ── Configs (stored in dashboard_widgets.config JSONB) ────────────────────

export type ProspectingSummaryWidgetConfig = Record<string, never>
export type ConnectionRateWidgetConfig = Record<string, never>
export type HotLeadsWidgetConfig = { max_items: number }
export type FollowupsDueWidgetConfig = { max_items: number }
export type ActiveCallSessionWidgetConfig = Record<string, never>

// ── Data shapes ───────────────────────────────────────────────────────────

export type ProspectingSummaryData = {
  callsToday: number
  connectsToday: number
  connectionRate: number       // 0..1
  meetingsBookedToday: number
  remaining: number            // calls left to hit target
  target: number
  targetLabel: string          // e.g. "Goal target"
  sessionActive: boolean
}

export type ConnectionRateData = {
  todayRate: number            // 0..1
  weekRate: number             // 0..1
  todayCalls: number
  weekCalls: number
  todayConnects: number
  weekConnects: number
  trend: number                // todayRate − weekRate (positive = improving)
}

export type HotLeadItem = {
  recordId: string
  title: string
  boardId: string | null
  temperature: LeadTemperature
  reason: string | null
  daysSinceContact: number | null
  nextActionDueAt: string | null
}

export type HotLeadsData = {
  leads: HotLeadItem[]
}

export type FollowupsDueData = {
  items: FollowUpDueItem[]
  total: number
}

export type ActiveCallSessionData = {
  active: boolean
  organizationId: string
  sessionId: string | null
  startedAt: string | null
  attempted: number
  connected: number
  meetings: number
  target: number
}

// ── Defaults ──────────────────────────────────────────────────────────────

export function defaultProspectingSummaryConfig(): ProspectingSummaryWidgetConfig { return {} }
export function defaultConnectionRateConfig(): ConnectionRateWidgetConfig { return {} }
export function defaultHotLeadsConfig(): HotLeadsWidgetConfig { return { max_items: 5 } }
export function defaultFollowupsDueConfig(): FollowupsDueWidgetConfig { return { max_items: 6 } }
export function defaultActiveCallSessionConfig(): ActiveCallSessionWidgetConfig { return {} }
