// Mortgage starter workflow templates.
//
// These are TEMPLATES, not engine assumptions — every concept here is
// expressed through the generic trigger/condition/action vocabulary. Orgs
// install them as `workflows` rows and can enable/disable each one. Swap the
// group-name substrings and they fit any sales motion.

import type { WorkflowTemplate } from '../types'

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'lead-follow-up',
    title: 'Lead Follow-Up',
    description: 'When a record enters a Leads stage, create a follow-up task and set tomorrow’s next action.',
    trigger: 'record.group_changed',
    conditions: [{ kind: 'group_name_contains', value: 'lead' }, { kind: 'no_next_action' }],
    actions: [
      { kind: 'create_task', title: 'Follow up with {record}', dueInDays: 1, priority: 'high' },
      { kind: 'set_next_action', label: 'Initial follow-up call', dueInDays: 1 },
      { kind: 'log_activity', content: 'Lead Follow-Up workflow scheduled an initial follow-up.' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'needs-docs',
    title: 'Document Request',
    description: 'When a record moves to a Docs stage, create a document-request task due tomorrow.',
    trigger: 'record.group_changed',
    conditions: [{ kind: 'group_name_contains', value: 'doc' }],
    actions: [
      { kind: 'create_task', title: 'Request documents from {record}', dueInDays: 1, priority: 'high' },
      { kind: 'set_next_action', label: 'Collect outstanding documents', dueInDays: 2 },
    ],
    enabledByDefault: true,
  },
  {
    id: 'contract-checklist',
    title: 'Contract Checklist',
    description: 'When a record reaches a Contract stage, generate the standard onboarding checklist tasks.',
    trigger: 'record.group_changed',
    conditions: [{ kind: 'group_name_contains', value: 'contract' }],
    actions: [
      { kind: 'create_task', title: 'Order appraisal for {record}', dueInDays: 2, priority: 'high' },
      { kind: 'create_task', title: 'Confirm title & escrow for {record}', dueInDays: 3, priority: 'medium' },
      { kind: 'create_task', title: 'Send disclosures to {record}', dueInDays: 1, priority: 'urgent' },
      { kind: 'set_next_action', label: 'Kick off contract checklist', dueInDays: 1 },
    ],
    enabledByDefault: true,
  },
  {
    id: 'nurture-follow-up',
    title: 'Nurture Cadence',
    description: 'When a record moves to a Nurture stage, schedule a longer-horizon follow-up.',
    trigger: 'record.group_changed',
    conditions: [{ kind: 'group_name_contains', value: 'nurture' }],
    actions: [
      { kind: 'set_next_action', label: 'Nurture check-in', dueInDays: 30 },
      { kind: 'log_activity', content: 'Nurture Cadence scheduled a 30-day check-in.' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'stale-reengagement',
    title: 'Stale Record Re-Engagement',
    description: 'When an active record has no activity for 7 days, flag it for attention and create a re-engagement action.',
    trigger: 'no_activity_detected',
    conditions: [{ kind: 'no_activity_days', days: 7 }, { kind: 'status_in', values: ['active'] }],
    actions: [
      { kind: 'create_daily_action', title: 'Re-engage {record} — no activity in 7 days', priority: 'high' },
      { kind: 'flag_attention', reason: 'No activity in 7 days' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'overdue-next-action',
    title: 'Overdue Next Action',
    description: 'When a record’s next action is past due, surface a daily action so it doesn’t slip.',
    trigger: 'next_action_overdue',
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'create_daily_action', title: 'Overdue: {record} next action needs attention', priority: 'urgent' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'synced-record-updated',
    title: 'Synced Record Updated',
    description: 'When an integration updates an existing record, log a system activity for traceability.',
    trigger: 'record.updated',
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'log_activity', content: 'Record updated from a connected system.' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'call-no-answer-followup',
    title: 'Missed Call Follow-Up',
    description: 'When a call is logged as no-answer or voicemail, set a next action to try again.',
    trigger: 'communication.logged',
    conditions: [{ kind: 'comm_outcome_in', values: ['no_answer', 'voicemail'] }, { kind: 'no_next_action' }],
    actions: [
      { kind: 'set_next_action', label: 'Call back {record}', dueInDays: 1 },
    ],
    enabledByDefault: true,
  },
  {
    id: 'comm-follow-up-needed',
    title: 'Follow-Up Needed',
    description: 'When a communication is flagged follow-up-needed, surface a daily action so it does not slip.',
    trigger: 'communication.logged',
    conditions: [{ kind: 'comm_outcome_in', values: ['follow_up_needed'] }],
    actions: [
      { kind: 'create_daily_action', title: 'Follow up with {record}', priority: 'high' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'sms-received-followup',
    title: 'Inbound SMS Reply',
    description: 'When a text comes in, set a next action to reply and surface it on Today.',
    trigger: 'sms.received',
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'create_daily_action', title: 'Reply to SMS from {record}', priority: 'high' },
      { kind: 'set_next_action', label: 'Reply to {record} text', dueInDays: 0 },
    ],
    enabledByDefault: true,
  },
  {
    id: 'sms-unread-attention',
    title: 'Unread Conversation Alert',
    description: 'When a conversation has 2+ unread texts, flag it for immediate attention.',
    trigger: 'conversation.unread',
    conditions: [{ kind: 'thread_unread_count_gte', value: 2 }],
    actions: [
      { kind: 'flag_attention', reason: 'Unread SMS messages' },
      { kind: 'create_daily_action', title: 'Check unread SMS: {record}', priority: 'urgent' },
    ],
    enabledByDefault: true,
  },
  {
    id: 'sms-failed-retry',
    title: 'SMS Delivery Failed',
    description: 'When an outbound text fails to deliver, log it and prompt a call instead.',
    trigger: 'sms.failed',
    conditions: [{ kind: 'always' }],
    actions: [
      { kind: 'log_activity', content: 'SMS to {record} failed to deliver — consider calling.' },
      { kind: 'create_daily_action', title: 'Retry {record} via call', priority: 'high' },
    ],
    enabledByDefault: false,
  },
]

export function templateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id)
}

/** Payload for ensure_default_workflows RPC. */
export function templatesInstallPayload() {
  return WORKFLOW_TEMPLATES.map(t => ({
    template_id: t.id,
    title: t.title,
    description: t.description,
    trigger_type: t.trigger,
  }))
}
