// Operational workspaces — one persistent "tab" per opened record.
// State shape kept small; large data (record/fields/activities/etc.) is loaded
// lazily by each workspace tab on render.

export type WorkspaceTab = {
  recordId: string
  title: string                            // cached label so the open-workspaces list can render before the record loads
}

export type NoteRow = {
  id: string
  organization_id: string
  record_id: string
  author_user_id: string | null
  content: string
  created_at: string
  updated_at: string
}

export type TimelineItemType =
  | 'note'
  | 'task'
  | 'movement'
  | 'activity'

export type TimelineItem = {
  id: string
  type: TimelineItemType
  activity_type: string                    // raw activity_type for activity entries; synthetic for others
  timestamp: string                        // ISO
  actor_id: string | null
  actor_name: string | null
  content: string | null
  metadata?: Record<string, unknown>
}

export const MAX_OPEN_WORKSPACES = 10
