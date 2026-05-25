'use client'

// Builds record-aware commands for the active workspace. Pure builder — it
// returns CommandItems whose handlers close over injected deps (toast, server
// actions, workspace controls). No entity-specific / mortgage logic; every
// command operates on generic record primitives (status, priority, group,
// next action, tasks, notes).

import { executeCommand } from '../execution/executeCommand'
import { moveRecord, updateRecord } from '@/features/records/actions'
import { createTask } from '@/features/tasks/actions'
import { createNote, setNextAction, completeNextAction } from '@/features/workspace/notes/actions'
import { createDailyAction } from '@/features/daily-actions/actions'
import { recordCommandExecution } from '../history/useCommandHistory'
import type { ActiveRecordContext, CommandItem } from '../types'
import type { RecordStatus, RecordPriority } from '@/types/database'

type ToastApi = {
  success: (message: string, opts?: { undo?: () => void | Promise<void> }) => void
  error: (message: string) => void
  info: (message: string) => void
}

export type ContextualDeps = {
  toast: ToastApi
  close: () => void
  setActiveSubTab: (recordId: string, tab: string) => void
}

const STATUS_OPTIONS: { value: RecordStatus; label: string }[] = [
  { value: 'active',  label: 'Active' },
  { value: 'won',     label: 'Won' },
  { value: 'lost',    label: 'Lost' },
  { value: 'on_hold', label: 'On Hold' },
]

const PRIORITY_OPTIONS: { value: RecordPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high',   label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low',    label: 'Low' },
  { value: 'none',   label: 'None' },
]

// ── Date presets for next action / snooze (generic, no NLP yet) ────────────

function atHour(base: Date, hour: number): Date {
  const d = new Date(base)
  d.setHours(hour, 0, 0, 0)
  return d
}
function addDays(days: number, hour = 9): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return atHour(d, hour)
}
function nextWeekday(targetDow: number, hour = 9): Date {
  // targetDow: 0=Sun..6=Sat. Returns the next occurrence (strictly future).
  const d = new Date()
  const cur = d.getDay()
  let delta = (targetDow - cur + 7) % 7
  if (delta === 0) delta = 7
  d.setDate(d.getDate() + delta)
  return atHour(d, hour)
}

function datePresets(): { label: string; date: Date }[] {
  return [
    { label: 'Later today',  date: atHour(new Date(), 17) },
    { label: 'Tomorrow',     date: addDays(1) },
    { label: 'Friday',       date: nextWeekday(5) },
    { label: 'Next Monday',  date: nextWeekday(1) },
    { label: 'In one week',  date: addDays(7) },
  ]
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function contextualCommands(ctx: ActiveRecordContext | null, deps: ContextualDeps): CommandItem[] {
  if (!ctx) return []
  const { toast, close, setActiveSubTab } = deps
  const r = ctx

  const run = (
    commandId: string,
    title: string,
    iconName: string,
    work: () => Promise<void>,
    successMessage: string,
  ) => {
    recordCommandExecution({ commandId, title, iconName })
    return executeCommand(
      { run: work, refreshRecordId: r.recordId, successMessage, onDone: close },
      toast,
    )
  }

  const items: CommandItem[] = []

  // ── Move to stage/group ───────────────────────────────────────────────
  const otherGroups = r.groups.filter(g => g.id !== r.groupId)
  items.push({
    id: 'ctx:move-stage',
    type: 'action',
    title: 'Move to Stage',
    subtitle: r.groups.find(g => g.id === r.groupId)?.name ?? undefined,
    iconName: 'ArrowRightLeft',
    keywords: ['move', 'stage', 'group', 'pipeline'],
    groupLabel: 'Record Actions',
    intoPage: {
      kind: 'list',
      title: 'Move to…',
      placeholder: 'Search stages…',
      loadItems: () => otherGroups.map(g => ({
        id: `ctx:move-stage:${g.id}`,
        type: 'action',
        title: g.name,
        iconName: 'Circle',
        groupLabel: 'Stages',
        onSelect: () => run('ctx:move-stage', 'Move to Stage', 'ArrowRightLeft',
          () => moveRecord(r.recordId, g.id, r.boardId),
          `Moved to ${g.name}`),
      })),
    },
  })

  // ── Change priority ───────────────────────────────────────────────────
  items.push({
    id: 'ctx:change-priority',
    type: 'action',
    title: 'Change Priority',
    preview: capitalize(r.priority),
    iconName: 'Flag',
    keywords: ['priority', 'urgent', 'high', 'low'],
    groupLabel: 'Record Actions',
    intoPage: {
      kind: 'list',
      title: 'Set priority…',
      placeholder: 'Search priorities…',
      loadItems: () => PRIORITY_OPTIONS.map(p => ({
        id: `ctx:priority:${p.value}`,
        type: 'action',
        title: p.label,
        preview: p.value === r.priority ? 'Current' : undefined,
        iconName: 'Flag',
        groupLabel: 'Priority',
        onSelect: () => run('ctx:change-priority', 'Change Priority', 'Flag',
          () => updateRecord(r.recordId, r.boardId, { priority: p.value }),
          `Priority set to ${p.label}`),
      })),
    },
  })

  // ── Change status ─────────────────────────────────────────────────────
  items.push({
    id: 'ctx:change-status',
    type: 'action',
    title: 'Change Status',
    preview: capitalize(r.status),
    iconName: 'CircleDot',
    keywords: ['status', 'active', 'won', 'lost', 'hold'],
    groupLabel: 'Record Actions',
    intoPage: {
      kind: 'list',
      title: 'Set status…',
      placeholder: 'Search statuses…',
      loadItems: () => STATUS_OPTIONS.map(s => ({
        id: `ctx:status:${s.value}`,
        type: 'action',
        title: s.label,
        preview: s.value === r.status ? 'Current' : undefined,
        iconName: 'CircleDot',
        groupLabel: 'Status',
        onSelect: () => run('ctx:change-status', 'Change Status', 'CircleDot',
          () => updateRecord(r.recordId, r.boardId, { status: s.value }),
          `Status set to ${s.label}`),
      })),
    },
  })

  // ── Next action ───────────────────────────────────────────────────────
  const hasOpenNextAction = !!r.nextAction && !r.nextActionCompletedAt
  items.push({
    id: 'ctx:set-next-action',
    type: 'action',
    title: r.nextAction ? 'Change Next Action' : 'Set Next Action',
    preview: r.nextAction ?? undefined,
    iconName: 'Zap',
    keywords: ['next action', 'follow up', 'reminder'],
    groupLabel: 'Next Action',
    intoPage: {
      kind: 'input',
      title: 'Next action',
      placeholder: 'e.g. Follow up, Review proposal, Send recap…',
      submitLabel: 'Continue',
      initialValue: r.nextAction ?? '',
      // After typing the label, chain into a due-date picker by stashing the
      // label and re-running with a date. We do it in one step: pick "no date"
      // or a preset via a follow-up list isn't trivial in one input, so we set
      // with a default (tomorrow 9am) and let the user adjust via "Snooze".
      onSubmit: (value) => {
        const label = value.trim()
        if (!label) return
        run('ctx:set-next-action', 'Set Next Action', 'Zap',
          () => setNextAction({ record_id: r.recordId, next_action: label, next_action_due_at: addDays(1).toISOString() }),
          `Next action set · due tomorrow`)
      },
    },
  })

  if (hasOpenNextAction) {
    items.push({
      id: 'ctx:complete-next-action',
      type: 'action',
      title: 'Complete Next Action',
      preview: r.nextAction ?? undefined,
      iconName: 'CheckCircle2',
      keywords: ['complete', 'done', 'next action'],
      groupLabel: 'Next Action',
      onSelect: () => run('ctx:complete-next-action', 'Complete Next Action', 'CheckCircle2',
        () => completeNextAction(r.recordId),
        'Next action completed'),
    })

    items.push({
      id: 'ctx:snooze-next-action',
      type: 'action',
      title: 'Snooze Next Action',
      iconName: 'Clock',
      keywords: ['snooze', 'reschedule', 'defer', 'later'],
      groupLabel: 'Next Action',
      intoPage: {
        kind: 'list',
        title: 'Snooze until…',
        placeholder: 'Search presets…',
        loadItems: () => datePresets().map(p => ({
          id: `ctx:snooze:${p.label}`,
          type: 'action',
          title: p.label,
          subtitle: p.date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' }),
          iconName: 'Clock',
          groupLabel: 'Snooze',
          onSelect: () => run('ctx:snooze-next-action', 'Snooze Next Action', 'Clock',
            () => setNextAction({ record_id: r.recordId, next_action: r.nextAction, next_action_due_at: p.date.toISOString() }),
            `Snoozed to ${p.label.toLowerCase()}`),
        })),
      },
    })

    items.push({
      id: 'ctx:clear-next-action',
      type: 'action',
      title: 'Clear Next Action',
      iconName: 'X',
      keywords: ['clear', 'remove', 'next action'],
      groupLabel: 'Next Action',
      onSelect: () => run('ctx:clear-next-action', 'Clear Next Action', 'X',
        () => setNextAction({ record_id: r.recordId, next_action: null, next_action_due_at: null }),
        'Next action cleared'),
    })
  }

  // ── Create task ───────────────────────────────────────────────────────
  items.push({
    id: 'ctx:create-task',
    type: 'action',
    title: 'Create Task',
    iconName: 'CheckSquare',
    keywords: ['task', 'todo', 'create'],
    groupLabel: 'Tasks',
    intoPage: {
      kind: 'input',
      title: 'New task',
      placeholder: 'Task title…',
      submitLabel: 'Create',
      onSubmit: (value) => {
        const title = value.trim()
        if (!title) return
        run('ctx:create-task', 'Create Task', 'CheckSquare',
          () => createTask({ organization_id: r.organizationId, record_id: r.recordId, board_id: r.boardId, title, priority: 'medium' }).then(() => {}),
          'Task created')
      },
    },
  })

  // ── Add note ──────────────────────────────────────────────────────────
  items.push({
    id: 'ctx:add-note',
    type: 'action',
    title: 'Add Note',
    iconName: 'FileText',
    keywords: ['note', 'comment', 'log'],
    groupLabel: 'Notes',
    intoPage: {
      kind: 'input',
      title: 'New note',
      placeholder: 'Write a note…',
      submitLabel: 'Save note',
      multiline: true,
      onSubmit: (value) => {
        const content = value.trim()
        if (!content) return
        run('ctx:add-note', 'Add Note', 'FileText',
          () => createNote({ organization_id: r.organizationId, record_id: r.recordId, content }).then(() => {}),
          'Note added')
      },
    },
  })

  // ── Tab navigation within the workspace ───────────────────────────────
  const tabCmd = (tab: string, label: string, icon: string) => ({
    id: `ctx:open-${tab}`,
    type: 'action' as const,
    title: label,
    iconName: icon,
    keywords: ['open', tab, 'tab'],
    groupLabel: 'Workspace',
    onSelect: () => {
      recordCommandExecution({ commandId: `ctx:open-${tab}`, title: label, iconName: icon })
      setActiveSubTab(r.recordId, tab)
      close()
    },
  })
  items.push(tabCmd('tasks',    'Open Tasks Tab',    'CheckSquare'))
  items.push(tabCmd('activity', 'Open Activity Tab', 'Activity'))
  items.push(tabCmd('notes',    'Open Notes Tab',    'FileText'))
  items.push(tabCmd('pipeline', 'Open Pipeline Tab', 'Columns3'))

  // ── Mark needs attention (feeds /today) ───────────────────────────────
  items.push({
    id: 'ctx:mark-attention',
    type: 'action',
    title: 'Mark Needs Attention',
    iconName: 'Flag',
    keywords: ['attention', 'flag', 'follow up', 'today'],
    groupLabel: 'Record Actions',
    onSelect: () => run('ctx:mark-attention', 'Mark Needs Attention', 'Flag',
      () => createDailyAction({
        organization_id: r.organizationId,
        record_id: r.recordId,
        title: `Needs attention: ${r.title}`,
        priority: 'high',
        action_type: 'attention',
        source: 'manual',
      }).then(() => {}),
      'Flagged for attention on Today'),
  })

  // ── Set reminder (next action with a preset date) ─────────────────────
  items.push({
    id: 'ctx:set-reminder',
    type: 'action',
    title: 'Set Reminder',
    iconName: 'Clock',
    keywords: ['reminder', 'follow up', 'schedule', 'later'],
    groupLabel: 'Next Action',
    intoPage: {
      kind: 'list',
      title: 'Remind me…',
      placeholder: 'Search presets…',
      loadItems: () => datePresets().map(p => ({
        id: `ctx:reminder:${p.label}`,
        type: 'action',
        title: p.label,
        subtitle: p.date.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' }),
        iconName: 'Clock',
        groupLabel: 'Reminder',
        onSelect: () => run('ctx:set-reminder', 'Set Reminder', 'Clock',
          () => setNextAction({ record_id: r.recordId, next_action: r.nextAction ?? 'Follow up', next_action_due_at: p.date.toISOString() }),
          `Reminder set for ${p.label.toLowerCase()}`),
      })),
    },
  })

  // ── Copy record link ──────────────────────────────────────────────────
  items.push({
    id: 'ctx:copy-link',
    type: 'action',
    title: 'Copy Record Link',
    iconName: 'Link',
    keywords: ['copy', 'link', 'share', 'url'],
    groupLabel: 'Record Actions',
    onSelect: () => {
      const url = `${window.location.origin}/boards/${r.boardId}#record-${r.recordId}`
      navigator.clipboard?.writeText(url).then(
        () => { toast.success('Record link copied'); close() },
        () => { toast.error('Could not copy link') },
      )
    },
  })

  // ── Archive ───────────────────────────────────────────────────────────
  items.push({
    id: 'ctx:archive-record',
    type: 'action',
    title: 'Archive Record',
    iconName: 'Archive',
    keywords: ['archive', 'remove', 'delete'],
    groupLabel: 'Record Actions',
    onSelect: () => {
      if (!confirm(`Archive "${r.title}"?`)) return
      run('ctx:archive-record', 'Archive Record', 'Archive',
        () => updateRecord(r.recordId, r.boardId, { status: 'archived' as RecordStatus }),
        'Record archived')
    },
  })

  // ── Duplicate (placeholder — kept visible to advertise the capability) ──
  items.push({
    id: 'ctx:duplicate-record',
    type: 'action',
    title: 'Duplicate Record',
    subtitle: 'Coming soon',
    iconName: 'Copy',
    keywords: ['duplicate', 'clone', 'copy record'],
    groupLabel: 'Record Actions',
    onSelect: () => { toast.info('Duplicate is coming in a future phase'); },
  })

  return items
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')
}
