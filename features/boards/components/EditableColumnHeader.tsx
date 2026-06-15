'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Eye } from 'lucide-react'
import { updateField } from '@/features/fields/actions'
import { ColumnMenu } from './ColumnMenu'
import { cn } from '@/lib/utils'
import type { FieldType } from '@/types/database'

interface Props {
  field: { id: string; name: string; field_type?: FieldType; is_default_status?: boolean }
  /** Phase 35B/35F — column controls. Optional so existing callers still work. */
  boardId?: string
  groupId?: string
  isCommon?: boolean
}

/**
 * Column header: double-click (or the menu's Rename) to rename inline — Enter /
 * blur save, Escape revert, optimistic with rollback. The slug is intentionally
 * untouched so downstream slug-readers keep working. The ⋮ ColumnMenu (Phase
 * 35F) holds rename / change-type / duplicate / delete + visibility controls.
 */
export function EditableColumnHeader({ field, boardId, groupId, isCommon = true }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.name)
  const [optimistic, setOptimistic] = useState(field.name)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const canManage = !!boardId && !!groupId

  // Sync from server when the parent re-renders with new field data.
  useEffect(() => { setOptimistic(field.name); setDraft(field.name) }, [field.name])

  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const save = (raw: string) => {
    const next = raw.trim()
    setEditing(false)
    if (!next || next === optimistic) { setDraft(optimistic); return }
    const previous = optimistic
    setOptimistic(next)
    startTransition(async () => {
      try {
        await updateField(field.id, { name: next })
        router.refresh()
      } catch (err) {
        setOptimistic(previous)
        setDraft(previous)
        alert(err instanceof Error ? err.message : 'Could not rename column')
      }
    })
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        value={draft}
        maxLength={60}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => save(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(draft) }
          if (e.key === 'Escape') { setDraft(optimistic); setEditing(false) }
        }}
        className="w-full bg-surface-1 border border-primary rounded px-1.5 py-0.5 text-xs font-medium text-foreground focus:outline-none"
      />
    )
  }

  return (
    <span className="group/col inline-flex items-center gap-1">
      <span
        onDoubleClick={() => { setDraft(optimistic); setEditing(true) }}
        title="Double-click to rename"
        className={cn('inline-flex items-center gap-1.5 cursor-text select-none', isPending && 'opacity-70')}
      >
        {optimistic}
        {/* Group-specific marker so restricted columns are recognizable. */}
        {canManage && !isCommon && (
          <Eye className="h-2.5 w-2.5 text-primary/70" aria-label="Group-specific field" />
        )}
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>

      {canManage && (
        <ColumnMenu
          field={{ id: field.id, name: optimistic, field_type: (field.field_type ?? 'text') as FieldType, is_default_status: field.is_default_status }}
          boardId={boardId!}
          groupId={groupId!}
          isCommon={isCommon}
          onStartRename={() => { setDraft(optimistic); setEditing(true) }}
        />
      )}
    </span>
  )
}
