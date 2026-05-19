'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { NoteRow } from '../types'

export type RecordRow = {
  id: string
  organization_id: string
  board_id: string
  group_id: string | null
  title: string
  status: string
  priority: string
  value: number | null
  next_action: string | null
  next_action_due_at: string | null
  next_action_completed_at: string | null
  created_at: string
  updated_at: string
}

export type FieldRow = {
  id: string
  board_id: string
  name: string
  slug: string
  field_type: string
  position: number
  config: Record<string, unknown>
}

export type FieldValueRow = {
  id: string
  field_id: string
  record_id: string
  value_text: string | null
  value_number: number | null
  value_boolean: boolean | null
  value_date: string | null
  value_json: unknown
}

export type GroupRow = { id: string; name: string; color: string | null }
export type BoardLite = { id: string; name: string }

export type TaskRow = {
  id: string
  record_id: string
  title: string
  description: string | null
  priority: string
  due_date: string | null
  completed_at: string | null
  assigned_user_id: string | null
  created_at: string
}

export type ActivityRow = {
  id: string
  activity_type: string
  content: string | null
  created_at: string
  user_id: string | null
  metadata: Record<string, unknown> | null
}

export type MovementRow = {
  id: string
  created_at: string
  user_id: string | null
  from_group: { name: string } | null
  to_group: { name: string } | null
  movement_type: string
}

export type ProfileLite = { id: string; first_name: string | null; last_name: string | null }

export type WorkspaceData = {
  record: RecordRow | null
  board: BoardLite | null
  groups: GroupRow[]
  fields: FieldRow[]
  fieldValues: FieldValueRow[]
  tasks: TaskRow[]
  activities: ActivityRow[]
  movements: MovementRow[]
  notes: NoteRow[]
  profiles: Record<string, ProfileLite>
  loading: boolean
  refetch: () => Promise<void>
}

/**
 * Fetches everything needed to render a workspace for one recordId.
 * Re-fetches when recordId or `version` changes (caller bumps version to refresh).
 */
export function useWorkspaceData(recordId: string | null): WorkspaceData {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState<Omit<WorkspaceData, 'refetch'>>({
    record: null, board: null, groups: [], fields: [], fieldValues: [],
    tasks: [], activities: [], movements: [], notes: [], profiles: {},
    loading: true,
  })

  useEffect(() => {
    if (!recordId) {
      setState(s => ({ ...s, loading: false, record: null }))
      return
    }
    let cancelled = false
    setState(s => ({ ...s, loading: true }))
    ;(async () => {
      const supabase = createClient()
      const { data: record } = await supabase
        .from('records')
        .select('*, next_action, next_action_due_at')
        .eq('id', recordId)
        .single()
      if (!record || cancelled) {
        if (!cancelled) setState(s => ({ ...s, loading: false, record: null }))
        return
      }

      const boardId = (record as RecordRow).board_id

      const [
        boardRes, groupsRes, fieldsRes, fvRes, tasksRes, activitiesRes, movementsRes, notesRes,
      ] = await Promise.all([
        supabase.from('boards').select('id, name').eq('id', boardId).single(),
        supabase.from('board_groups').select('id, name, color').eq('board_id', boardId).eq('is_archived', false).order('position'),
        supabase.from('fields').select('*').eq('board_id', boardId).order('position'),
        supabase.from('field_values').select('*').eq('record_id', recordId),
        supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: true }),
        supabase.from('activities').select('id, activity_type, content, created_at, user_id, metadata').eq('record_id', recordId).order('created_at', { ascending: false }).limit(50),
        supabase.from('record_movements').select('id, created_at, user_id, movement_type, from_group:from_group_id(name), to_group:to_group_id(name)').eq('record_id', recordId).order('created_at', { ascending: false }).limit(30),
        supabase.from('notes').select('*').eq('record_id', recordId).order('updated_at', { ascending: false }),
      ])

      // Profile name lookup for activity actors / note authors
      const userIds = new Set<string>()
      for (const a of activitiesRes.data ?? []) if (a.user_id) userIds.add(a.user_id)
      for (const m of movementsRes.data ?? []) if (m.user_id) userIds.add(m.user_id)
      for (const n of notesRes.data ?? []) if (n.author_user_id) userIds.add(n.author_user_id)

      let profileMap: Record<string, ProfileLite> = {}
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', [...userIds])
        profileMap = Object.fromEntries((profiles ?? []).map((p: ProfileLite) => [p.id, p]))
      }

      if (cancelled) return
      setState({
        record:      record as RecordRow,
        board:       (boardRes.data ?? null) as BoardLite | null,
        groups:      (groupsRes.data ?? []) as GroupRow[],
        fields:      (fieldsRes.data ?? []) as FieldRow[],
        fieldValues: (fvRes.data ?? []) as FieldValueRow[],
        tasks:       (tasksRes.data ?? []) as TaskRow[],
        activities:  (activitiesRes.data ?? []) as ActivityRow[],
        movements:   (movementsRes.data ?? []) as unknown as MovementRow[],
        notes:       (notesRes.data ?? []) as NoteRow[],
        profiles:    profileMap,
        loading:     false,
      })
    })()
    return () => { cancelled = true }
  }, [recordId, version])

  return { ...state, refetch: async () => setVersion(v => v + 1) }
}
