'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function useBoardRealtime(boardId: string, isMutating: React.RefObject<boolean>) {
  const router = useRouter()
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleRefresh = () => {
    // Skip refresh if we triggered the change ourselves (optimistic update in flight)
    if (isMutating.current) return
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 400)
  }

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`board-realtime:${boardId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'records',
        filter: `board_id=eq.${boardId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'field_values',
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'board_groups',
        filter: `board_id=eq.${boardId}`,
      }, scheduleRefresh)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'fields',
        filter: `board_id=eq.${boardId}`,
      }, scheduleRefresh)
      .subscribe()

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      supabase.removeChannel(channel)
    }
  }, [boardId])
}
