'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ActiveRecordContext } from '../types'

// Loads the minimal context the palette needs to build record-aware commands
// for the active workspace. Re-fetches when the active record changes or when
// a workspace-refresh event fires (so previews like priority/status stay live).
export function useActiveRecordContext(
  recordId: string | null,
): ActiveRecordContext | null {
  const [ctx, setCtx] = useState<ActiveRecordContext | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const onRefresh = () => setVersion(v => v + 1)
    window.addEventListener('jubo:refresh-workspace', onRefresh)
    return () => window.removeEventListener('jubo:refresh-workspace', onRefresh)
  }, [])

  useEffect(() => {
    if (!recordId) { setCtx(null); return }
    let cancelled = false
    ;(async () => {
      const supabase = createClient()
      const { data: record } = await supabase
        .from('records')
        .select('id, title, board_id, group_id, status, priority, value, organization_id, next_action, next_action_due_at, next_action_completed_at')
        .eq('id', recordId)
        .single()
      if (!record || cancelled) { if (!cancelled) setCtx(null); return }

      const { data: groups } = await supabase
        .from('board_groups')
        .select('id, name, color')
        .eq('board_id', record.board_id)
        .eq('is_archived', false)
        .order('position')

      if (cancelled) return
      setCtx({
        recordId: record.id,
        title: record.title,
        boardId: record.board_id,
        groupId: record.group_id,
        status: record.status,
        priority: record.priority,
        value: record.value,
        nextAction: record.next_action ?? null,
        nextActionDueAt: record.next_action_due_at ?? null,
        nextActionCompletedAt: (record as { next_action_completed_at?: string | null }).next_action_completed_at ?? null,
        organizationId: record.organization_id,
        groups: (groups ?? []) as ActiveRecordContext['groups'],
      })
    })()
    return () => { cancelled = true }
  }, [recordId, version])

  return ctx
}
