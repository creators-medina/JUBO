import type { SupabaseClient } from '@supabase/supabase-js'
import { interpolate } from '../types'
import type { WorkflowAction, WorkflowRecordSnapshot } from '../types'

export type ExecutedAction = { kind: string; detail?: string; skipped?: boolean }

// Executes one workflow action with idempotency guards. CRITICAL: actions use
// direct inserts / dedicated RPCs and NEVER dispatch workflow events — that's
// the loop-prevention guarantee (only user-initiated server actions dispatch).
export async function executeAction(
  action: WorkflowAction,
  record: WorkflowRecordSnapshot,
  userId: string,
  supabase: SupabaseClient,
): Promise<ExecutedAction> {
  switch (action.kind) {
    case 'create_task': {
      const title = interpolate(action.title, record)
      // Dedupe: skip if an open task with the same title already exists on this record
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('record_id', record.id)
        .eq('title', title)
        .is('completed_at', null)
        .limit(1)
      if (existing && existing.length > 0) return { kind: 'create_task', detail: title, skipped: true }

      const due = action.dueInDays != null ? isoInDays(action.dueInDays) : null
      const { error } = await supabase.from('tasks').insert({
        organization_id: record.organization_id,
        record_id: record.id,
        title,
        due_date: due,
        priority: action.priority ?? 'medium',
        created_by: userId,
        assigned_user_id: userId,
      })
      if (error) throw new Error(error.message)
      return { kind: 'create_task', detail: title }
    }

    case 'set_next_action': {
      // Only set when there's no open next action — never clobber a human's choice
      if (record.next_action && !record.next_action_completed_at) {
        return { kind: 'set_next_action', detail: 'existing next action kept', skipped: true }
      }
      const label = interpolate(action.label, record)
      const due = isoInDays(action.dueInDays ?? 1)
      const { error } = await supabase.rpc('set_next_action', {
        p_record_id: record.id,
        p_next_action: label,
        p_due_at: due,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
      return { kind: 'set_next_action', detail: label }
    }

    case 'create_daily_action':
    case 'flag_attention': {
      const isFlag = action.kind === 'flag_attention'
      const title = isFlag
        ? interpolate(`Needs attention: {record} — ${action.reason}`, record)
        : interpolate(action.title, record)
      const dueDate = todayISO()
      // upsert_generated_daily_action dedupes goal_pacing/task sources; for our
      // 'workflow' source we dedupe manually by (user, date, title).
      const { data: existing } = await supabase
        .from('daily_actions')
        .select('id')
        .eq('user_id', userId)
        .eq('due_date', dueDate)
        .eq('title', title)
        .limit(1)
      if (existing && existing.length > 0) {
        return { kind: action.kind, detail: title, skipped: true }
      }
      const { error } = await supabase.rpc('create_daily_action', {
        p_organization_id: record.organization_id,
        p_title: title,
        p_description: null,
        p_priority: (action.kind === 'create_daily_action' ? action.priority : 'high') ?? 'medium',
        p_due_date: dueDate,
        p_action_type: isFlag ? 'attention' : 'workflow',
        p_source: 'workflow',
        p_production_goal_id: null,
        p_record_id: record.id,
        p_task_id: null,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
      return { kind: action.kind, detail: title }
    }

    case 'log_activity': {
      const content = interpolate(action.content, record)
      const { error } = await supabase.from('activities').insert({
        organization_id: record.organization_id,
        record_id: record.id,
        user_id: userId,
        activity_type: 'automation',
        content,
      })
      if (error) throw new Error(error.message)
      return { kind: 'log_activity', detail: content }
    }
  }
}

function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
