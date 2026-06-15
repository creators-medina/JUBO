// Workflow Trigger Engine — generic, serializable, event-driven.
//
// trigger → conditions → actions. The engine knows nothing about mortgages;
// it operates on generic record primitives. Mortgage flavour lives only in
// the starter templates (registry/templates.ts).

import type { TaskPriority } from '@/types/database'

// ── Triggers ─────────────────────────────────────────────────────────────────

export type WorkflowTriggerType =
  | 'record.created'
  | 'record.updated'
  | 'record.field_changed'
  | 'record.group_changed'
  | 'no_activity_detected'
  | 'next_action_overdue'
  | 'communication.logged'
  | 'sms.received'
  | 'sms.sent'
  | 'sms.failed'
  | 'conversation.unread'
  | 'no_reply_timeout'

// The event payload dispatched into the engine.
export type WorkflowEvent = {
  type: WorkflowTriggerType
  organizationId: string
  recordId: string
  // Optional context the conditions/actions may use
  record?: WorkflowRecordSnapshot
  fromGroupId?: string | null
  toGroupId?: string | null
  toGroupName?: string | null
  // record.updated: which field slugs changed materially (for payload/audit)
  changedFields?: string[]
  // record.field_changed context (Phase 34A — status/select cell changes)
  boardId?: string | null
  fieldId?: string
  fieldSlug?: string
  fieldType?: string
  fromValue?: string | null
  toValue?: string | null
  changedBy?: string | null
  // communication.logged context
  commChannel?: string
  commDirection?: string
  commOutcome?: string
  commFollowUpAt?: string | null
  // sms.* / conversation.* context
  participantPhone?: string | null
  threadId?: string | null
  unreadCount?: number
}

// Minimal record shape the engine reads (kept small + generic).
export type WorkflowRecordSnapshot = {
  id: string
  organization_id: string
  board_id: string
  group_id: string | null
  group_name?: string | null
  board_type?: string | null
  title: string
  status: string
  priority: string
  next_action: string | null
  next_action_due_at: string | null
  next_action_completed_at: string | null
  updated_at: string
}

// ── Conditions ────────────────────────────────────────────────────────────────

export type WorkflowCondition =
  | { kind: 'always' }
  | { kind: 'group_name_contains'; value: string }
  | { kind: 'priority_in'; values: string[] }
  | { kind: 'status_in'; values: string[] }
  | { kind: 'board_type_equals'; value: string }
  | { kind: 'no_next_action' }
  | { kind: 'no_activity_days'; days: number }
  | { kind: 'comm_outcome_in'; values: string[] }
  | { kind: 'thread_unread_count_gte'; value: number }
  | { kind: 'sms_direction_is'; value: 'inbound' | 'outbound' }

// ── Actions ────────────────────────────────────────────────────────────────────

export type WorkflowAction =
  | { kind: 'create_task'; title: string; dueInDays?: number; priority?: TaskPriority }
  | { kind: 'set_next_action'; label: string; dueInDays?: number }
  | { kind: 'create_daily_action'; title: string; priority?: TaskPriority }
  | { kind: 'log_activity'; content: string }
  | { kind: 'flag_attention'; reason: string }

// ── Templates ──────────────────────────────────────────────────────────────────

export type WorkflowTemplate = {
  id: string                       // stable code key
  title: string
  description: string
  trigger: WorkflowTriggerType
  conditions: WorkflowCondition[]  // ALL must pass (AND)
  actions: WorkflowAction[]
  enabledByDefault: boolean
}

// ── DB rows ──────────────────────────────────────────────────────────────────

export type WorkflowRow = {
  id: string
  organization_id: string
  template_id: string
  title: string
  description: string | null
  trigger_type: WorkflowTriggerType
  enabled: boolean
  config: Record<string, unknown>
  execution_count: number
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type WorkflowExecutionRow = {
  id: string
  organization_id: string
  workflow_id: string | null
  template_id: string | null
  trigger_type: string
  record_id: string | null
  payload: Record<string, unknown>
  actions_executed: Array<{ kind: string; detail?: string }>
  status: 'success' | 'skipped' | 'partial' | 'failed'
  created_at: string
}

// Title/label templating: replace {record} with the record title.
export function interpolate(text: string, record?: WorkflowRecordSnapshot): string {
  if (!record) return text
  return text.replace(/\{record\}/g, record.title).replace(/\{group\}/g, record.group_name ?? '')
}
