'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StickyNote, Trash2, Plus, Save } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import { createNote, updateNote, deleteNote } from './actions'
import type { NoteRow } from '../types'

interface Props {
  organizationId: string
  recordId: string
  notes: NoteRow[]
  currentUserId: string | null
  /** Open the composer immediately (e.g. the workspace Notes tab) — no hunting. */
  defaultDrafting?: boolean
  /** Phase 36E-1 — org members for @mention autocomplete (optional, additive). */
  members?: { id: string; name: string }[]
  /** Phase 5 — optional refetch hook so client-loaded surfaces (Overview) can
      refresh after create/edit/delete, in addition to router.refresh(). */
  onChanged?: () => void
}

const AUTOSAVE_DELAY_MS = 800

export function NoteList({ organizationId, recordId, notes, currentUserId, defaultDrafting = false, members, onChanged }: Props) {
  const router = useRouter()
  const [drafting, setDrafting] = useState(defaultDrafting)
  const [newDraft, setNewDraft] = useState('')
  const [, startTransition] = useTransition()

  const afterChange = () => { router.refresh(); onChanged?.() }

  const handleCreate = () => {
    if (!newDraft.trim()) { setDrafting(false); setNewDraft(''); return }
    startTransition(async () => {
      try {
        await createNote({
          organization_id: organizationId,
          record_id: recordId,
          content: newDraft.trim(),
        })
        setNewDraft('')
        setDrafting(false)
        afterChange()
      } catch {}
    })
  }

  return (
    <div className="space-y-3">
      {/* New note */}
      {drafting ? (
        <NoteDraft
          value={newDraft}
          onChange={setNewDraft}
          onSubmit={handleCreate}
          onCancel={() => { setDrafting(false); setNewDraft('') }}
          members={members}
          autoFocus
        />
      ) : (
        <button
          onClick={() => setDrafting(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add a note
        </button>
      )}

      {/* Existing notes */}
      {notes.length === 0 && !drafting ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <StickyNote className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No notes yet. Start a working log for this record.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <NoteItem
              key={n.id}
              note={n}
              canEdit={!!currentUserId && n.author_user_id === currentUserId}
              onAfter={afterChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NoteDraft({
  value, onChange, onSubmit, onCancel, autoFocus, members,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  autoFocus?: boolean
  members?: { id: string; name: string }[]
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null)

  // Phase 36E-1 — detect an "@token" being typed at the caret to drive autocomplete.
  const onType = (v: string) => {
    onChange(v)
    if (!members || members.length === 0) { setMention(null); return }
    const caret = taRef.current?.selectionStart ?? v.length
    const upto = v.slice(0, caret)
    const m = /(^|\s)@(\w*)$/.exec(upto)
    if (m) setMention({ query: m[2].toLowerCase(), start: caret - m[2].length - 1 })
    else setMention(null)
  }

  const matches = mention
    ? (members ?? []).filter((mm) => mm.name.toLowerCase().includes(mention.query)).slice(0, 6)
    : []

  const insertMention = (name: string) => {
    if (!mention) return
    const caret = taRef.current?.selectionStart ?? value.length
    const next = `${value.slice(0, mention.start)}@${name} ${value.slice(caret)}`
    onChange(next)
    setMention(null)
    requestAnimationFrame(() => taRef.current?.focus())
  }

  return (
    <div className="relative rounded-lg border border-border bg-card p-2 space-y-2">
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onType(e.target.value)}
        onKeyDown={e => {
          if (mention && matches.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); insertMention(matches[0].name); return }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); onSubmit() }
          if (e.key === 'Escape') { if (mention) { setMention(null); return } onCancel() }
        }}
        placeholder="Operational notes — what happened, what's next… @mention a teammate"
        autoFocus={autoFocus}
        rows={3}
        className="w-full px-2 py-1.5 rounded-md bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
      />
      {mention && matches.length > 0 && (
        <div className="absolute left-2 top-14 z-10 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          {matches.map((mm) => (
            <button key={mm.id} type="button" onMouseDown={(e) => { e.preventDefault(); insertMention(mm.name) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-1">
              @{mm.name}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-2xs text-muted-foreground">⌘⏎ to save · esc to cancel</p>
        <div className="flex items-center gap-1">
          <button
            onClick={onCancel}
            className="px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-2xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteItem({
  note, canEdit, onAfter,
}: {
  note: NoteRow
  canEdit: boolean
  onAfter: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(note.content)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedRef = useRef(note.content)

  // Autosave on debounce while editing
  const triggerAutosave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (content === lastSavedRef.current) return
      try {
        await updateNote(note.id, content)
        lastSavedRef.current = content
        setSavedAt(new Date())
      } catch {}
    }, AUTOSAVE_DELAY_MS)
  }, [content, note.id])

  useEffect(() => {
    if (!editing) return
    triggerAutosave()
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [content, editing, triggerAutosave])

  const finish = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    if (content !== lastSavedRef.current) {
      updateNote(note.id, content).then(() => { lastSavedRef.current = content; onAfter() }).catch(() => {})
    } else {
      onAfter()
    }
    setEditing(false)
  }

  const handleDelete = () => {
    if (!confirm('Delete this note?')) return
    deleteNote(note.id).then(onAfter).catch(() => {})
  }

  return (
    <div className="group rounded-lg border border-border bg-card p-3 space-y-1.5">
      {editing ? (
        <>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            onBlur={finish}
            onKeyDown={e => {
              if (e.key === 'Escape') { setContent(lastSavedRef.current); setEditing(false) }
            }}
            autoFocus
            rows={Math.min(8, Math.max(3, content.split('\n').length))}
            className="w-full px-2 py-1.5 rounded-md bg-surface-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none whitespace-pre-wrap"
          />
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Save className="w-2.5 h-2.5" />
              {savedAt ? `Saved ${formatDistanceToNow(savedAt.toISOString())}` : 'Autosaving…'}
            </span>
            <button
              onClick={finish}
              className="px-2 py-0.5 rounded text-2xs text-primary hover:bg-primary/10"
            >
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <p
            onClick={() => canEdit && setEditing(true)}
            className={cn(
              'text-sm text-foreground whitespace-pre-wrap',
              canEdit && 'cursor-text',
            )}
          >
            {note.content || <span className="text-muted-foreground italic">Empty note — click to edit</span>}
          </p>
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>{formatDistanceToNow(note.updated_at)}</span>
            {canEdit && (
              <button
                onClick={handleDelete}
                title="Delete"
                className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-all"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
