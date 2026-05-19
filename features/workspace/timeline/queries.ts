import { createClient } from '@/lib/supabase/server'
import type { TimelineItem } from '../types'

/**
 * Build a unified timeline for a record from:
 *   - activities (already log-shaped)
 *   - tasks (completion + creation events)
 *   - movements (group/board transitions)
 *
 * Returns items newest-first, ready for grouping by date in the UI.
 */
export async function getTimelineForRecord(recordId: string, limit = 80): Promise<TimelineItem[]> {
  const supabase = await createClient()

  // Pull each source in parallel
  const [activitiesRes, tasksRes, movementsRes] = await Promise.all([
    supabase.from('activities')
      .select('id, activity_type, content, created_at, user_id, metadata')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('tasks')
      .select('id, title, completed_at, created_at, created_by, assigned_user_id')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('movements')
      .select('id, movement_type, from_value, to_value, created_at, user_id')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(limit),
  ])

  const userIds = new Set<string>()
  ;(activitiesRes.data ?? []).forEach((a: { user_id: string | null }) => a.user_id && userIds.add(a.user_id))
  ;(tasksRes.data ?? []).forEach((t: { created_by: string | null }) => t.created_by && userIds.add(t.created_by))
  ;(movementsRes.data ?? []).forEach((m: { user_id: string | null }) => m.user_id && userIds.add(m.user_id))

  let profileMap: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', [...userIds])
    profileMap = Object.fromEntries(
      (profiles ?? []).map((p: { id: string; first_name: string | null; last_name: string | null }) =>
        [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unknown']),
    )
  }

  const items: TimelineItem[] = []

  for (const a of (activitiesRes.data ?? []) as Array<{ id: string; activity_type: string; content: string | null; created_at: string; user_id: string | null; metadata: Record<string, unknown> | null }>) {
    items.push({
      id:            `activity:${a.id}`,
      type:          'activity',
      activity_type: a.activity_type,
      timestamp:     a.created_at,
      actor_id:      a.user_id,
      actor_name:    a.user_id ? (profileMap[a.user_id] ?? null) : null,
      content:       a.content,
      metadata:      a.metadata ?? undefined,
    })
  }

  for (const t of (tasksRes.data ?? []) as Array<{ id: string; title: string; completed_at: string | null; created_at: string; created_by: string | null }>) {
    items.push({
      id:            `task-created:${t.id}`,
      type:          'task',
      activity_type: 'task_created',
      timestamp:     t.created_at,
      actor_id:      t.created_by,
      actor_name:    t.created_by ? (profileMap[t.created_by] ?? null) : null,
      content:       `Created task: ${t.title}`,
    })
    if (t.completed_at) {
      items.push({
        id:            `task-done:${t.id}`,
        type:          'task',
        activity_type: 'task_completed',
        timestamp:     t.completed_at,
        actor_id:      t.created_by,
        actor_name:    t.created_by ? (profileMap[t.created_by] ?? null) : null,
        content:       `Completed task: ${t.title}`,
      })
    }
  }

  for (const m of (movementsRes.data ?? []) as Array<{ id: string; movement_type: string; from_value: string | null; to_value: string | null; created_at: string; user_id: string | null }>) {
    items.push({
      id:            `movement:${m.id}`,
      type:          'movement',
      activity_type: m.movement_type,
      timestamp:     m.created_at,
      actor_id:      m.user_id,
      actor_name:    m.user_id ? (profileMap[m.user_id] ?? null) : null,
      content:       formatMovement(m.movement_type, m.from_value, m.to_value),
    })
  }

  // Sort newest first
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return items.slice(0, limit)
}

function formatMovement(type: string, from: string | null, to: string | null): string {
  const fromTxt = from ? `from ${from}` : ''
  const toTxt   = to   ? `to ${to}`     : ''
  const label = type.replace(/_/g, ' ')
  if (from && to) return `Moved ${label} ${fromTxt} ${toTxt}`
  if (to)         return `Moved ${label} ${toTxt}`
  return `Moved ${label}`
}
