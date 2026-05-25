import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkflowCondition, WorkflowEvent, WorkflowRecordSnapshot } from '../types'

// Evaluate a single condition against the event + record snapshot. Async
// because some conditions (no_activity_days) require a query. Generic — no
// entity assumptions.
export async function evaluateCondition(
  cond: WorkflowCondition,
  event: WorkflowEvent,
  record: WorkflowRecordSnapshot | null,
  supabase: SupabaseClient,
): Promise<boolean> {
  switch (cond.kind) {
    case 'always':
      return true

    case 'group_name_contains': {
      const name = (event.toGroupName ?? record?.group_name ?? '').toLowerCase()
      return name.includes(cond.value.toLowerCase())
    }

    case 'priority_in':
      return !!record && cond.values.includes(record.priority)

    case 'status_in':
      return !!record && cond.values.includes(record.status)

    case 'board_type_equals':
      return !!record && record.board_type === cond.value

    case 'no_next_action':
      return !record || !record.next_action || !!record.next_action_completed_at

    case 'no_activity_days': {
      if (!record) return false
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - cond.days)
      const { data } = await supabase
        .from('activities')
        .select('created_at')
        .eq('record_id', record.id)
        .order('created_at', { ascending: false })
        .limit(1)
      const last = data?.[0]?.created_at
      // No activity at all → stale if the record itself is older than the window
      if (!last) return new Date(record.updated_at) < cutoff
      return new Date(last) < cutoff
    }
  }
}

export async function evaluateAll(
  conditions: WorkflowCondition[],
  event: WorkflowEvent,
  record: WorkflowRecordSnapshot | null,
  supabase: SupabaseClient,
): Promise<boolean> {
  for (const c of conditions) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await evaluateCondition(c, event, record, supabase)
    if (!ok) return false
  }
  return true
}
