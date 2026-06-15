'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MoreVertical, Check, Globe, Eye } from 'lucide-react'
import { updateField, setFieldGroupVisibility } from '@/features/fields/actions'
import { cn } from '@/lib/utils'

interface Props {
  field: { id: string; name: string }
  /** Phase 35B — visibility controls. Optional so existing callers still work. */
  boardId?: string
  groupId?: string
  isCommon?: boolean
}

/**
 * Double-click a custom-field column header to rename it. Enter / blur save;
 * Escape reverts. Optimistic local update; rollback + alert on failure. Slug
 * is intentionally untouched so downstream slug-readers (mortgage workspace,
 * coaching, integrations) keep working after rename.
 *
 * Phase 35B adds a small per-column visibility menu ("Show in all groups" /
 * "Show only in this group"). A field with no visibility rows is common
 * (shows everywhere); restricting it to a group hides it from the others.
 */
export function EditableColumnHeader({ field, boardId, groupId, isCommon = true }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(field.name)
  const [optimistic, setOptimistic] = useState(field.name)
  const [isPending, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const canManageVisibility = !!boardId && !!groupId

  // Sync from server when the parent re-renders with new field data.
  useEffect(() => { setOptimistic(field.name); setDraft(field.name) }, [field.name])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  // Close the visibility menu on outside click.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

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

  const setVisibility = (mode: 'all' | 'only') => {
    if (!boardId || !groupId) return
    setMenuOpen(false)
    startTransition(async () => {
      try {
        await setFieldGroupVisibility({ fieldId: field.id, boardId, mode, groupId })
        router.refresh()
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Could not update visibility')
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
        className={cn(
          'inline-flex items-center gap-1.5 cursor-text select-none',
          isPending && 'opacity-70',
        )}
      >
        {optimistic}
        {/* Group-specific marker so restricted columns are recognizable. */}
        {canManageVisibility && !isCommon && (
          <Eye className="h-2.5 w-2.5 text-primary/70" aria-label="Group-specific field" />
        )}
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>

      {canManageVisibility && (
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="p-0.5 rounded text-muted-foreground opacity-0 group-hover/col:opacity-100 hover:text-foreground hover:bg-surface-2 transition-opacity"
            title="Column visibility"
          >
            <MoreVertical className="h-3 w-3" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 top-5 z-40 w-44 rounded-lg border border-border bg-card p-1 shadow-xl">
              <button
                type="button"
                onClick={() => setVisibility('all')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1"
              >
                <Globe className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1">Show in all groups</span>
                {isCommon && <Check className="h-3 w-3 text-primary" />}
              </button>
              <button
                type="button"
                onClick={() => setVisibility('only')}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1"
              >
                <Eye className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1">Show only in this group</span>
                {!isCommon && <Check className="h-3 w-3 text-primary" />}
              </button>
            </div>
          )}
        </div>
      )}
    </span>
  )
}
