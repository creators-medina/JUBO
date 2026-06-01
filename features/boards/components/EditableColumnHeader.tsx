'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { updateField } from '@/features/fields/actions'
import { cn } from '@/lib/utils'

interface Props {
  field: { id: string; name: string }
}

/**
 * Double-click a custom-field column header to rename it. Enter / blur save;
 * Escape reverts. Optimistic local update; rollback + alert on failure. Slug
 * is intentionally untouched so downstream slug-readers (mortgage workspace,
 * coaching, integrations) keep working after rename.
 */
export function EditableColumnHeader({ field }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.name)
  const [optimistic, setOptimistic] = useState(field.name)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync from server when the parent re-renders with new field data.
  useEffect(() => { setOptimistic(field.name); setDraft(field.name) }, [field.name])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

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
    <span
      onDoubleClick={() => { setDraft(optimistic); setEditing(true) }}
      title="Double-click to rename"
      className={cn(
        'inline-flex items-center gap-1.5 cursor-text select-none',
        isPending && 'opacity-70',
      )}
    >
      {optimistic}
      {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
    </span>
  )
}
