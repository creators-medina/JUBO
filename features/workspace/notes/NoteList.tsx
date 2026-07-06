'use client'

// ─────────────────────────────────────────────────────────────────────────
// NoteList — the record's working log. Base mode (CommunicateView, inline
// panels) is unchanged: collapsed "Add a note" → small draft, click-to-edit
// items with autosave, author-scoped delete behind a confirm.
//
// `prominent` mode (the Contact Card) upgrades it into a notes workspace:
// an always-open larger composer with mortgage quick-templates, client-side
// search over body/author, and a Today/Yesterday/Earlier timeline showing
// author + absolute created time (+ "edited"). `taskContext` additionally
// enables an explicit per-note "Create task" action through the existing
// createTask write path. Everything renders real stored data — no pinned or
// category columns exist in the notes model, so neither is faked here.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { StickyNote, Trash2, Plus, Save, Search, ListChecks, Loader2, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import { useToast } from '@/features/feedback/ToastProvider'
import { createTask } from '@/features/tasks/actions'
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
  /** Contact Card mode: always-open large composer, quick templates,
   *  client-side search, and a grouped timeline with author/date lines. */
  prominent?: boolean
  /** Enables the explicit per-note "Create task" action (existing createTask
   *  write path); omit where no board context exists. */
  taskContext?: { boardId: string }
}

const AUTOSAVE_DELAY_MS = 800

// Mortgage quick-templates — insert into the composer only; never auto-saved.
const NOTE_TEMPLATES = [
  'Borrower called — no answer.',
  'Left voicemail.',
  'Sent document request.',
  'Reviewed income.',
  'Reviewed credit.',
  'Needs updated bank statement.',
  'Waiting on realtor.',
  'Submitted to lender.',
  'Cleared condition.',
  'Follow up needed.',
]

export function NoteList({
  organizationId, recordId, notes, currentUserId, defaultDrafting = false, members, onChanged, prominent = false, taskContext,
}: Props) {
  const router = useRouter()
  const toast = useToast()
  const [drafting, setDrafting] = useState(defaultDrafting || prominent)
  const [newDraft, setNewDraft] = useState('')
  const [query, setQuery] = useState('')
  const [saving, startTransition] = useTransition()

  const afterChange = () => { router.refresh(); onChanged?.() }
  const nameOf = useCallback(
    (id: string | null) => (id ? members?.find((m) => m.id === id)?.name ?? null : null),
    [members],
  )

  const handleCreate = () => {
    if (saving) return // double-click/repeat-submit guard
    const content = newDraft.trim()
    if (!content) {
      if (!prominent) { setDrafting(false); setNewDraft('') }
      return
    }
    startTransition(async () => {
      try {
        await createNote({ organization_id: organizationId, record_id: recordId, content })
        // Clear ONLY after a confirmed save; prominent mode keeps the composer open.
        setNewDraft('')
        if (!prominent) setDrafting(false)
        afterChange()
      } catch (e) {
        // Draft kept — never silently lost.
        toast.error(`Couldn't save note — ${e instanceof Error ? e.message : 'please try again'}`)
      }
    })
  }

  const insertTemplate = (t: string) => {
    setDrafting(true)
    setNewDraft((d) => (d.trim() ? `${d.replace(/\s+$/, '')}\n${t}` : t))
  }

  // Client-side search over already-loaded notes (body + resolvable author).
  const q = query.trim().toLowerCase()
  const visible = q
    ? notes.filter((n) =>
        n.content.toLowerCase().includes(q) || (nameOf(n.author_user_id) ?? '').toLowerCase().includes(q))
    : notes

  return (
    <div className="space-y-3">
      {/* Quick templates — insert text only; the user edits then saves. */}
      {prominent && (
        <div className="flex flex-wrap gap-1">
          {NOTE_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => insertTemplate(t)}
              title="Insert into the note — nothing is saved until you click Add note"
              className="rounded-full border border-border bg-surface-1 px-2 py-0.5 text-2xs text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              {t.replace(/\.$/, '')}
            </button>
          ))}
        </div>
      )}

      {/* Composer — always open in prominent mode; collapsed button otherwise. */}
      {drafting ? (
        <NoteDraft
          value={newDraft}
          onChange={setNewDraft}
          onSubmit={handleCreate}
          onCancel={() => { setNewDraft(''); if (!prominent) setDrafting(false) }}
          members={members}
          autoFocus={!prominent}
          large={prominent}
          saving={saving}
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

      {/* Search — client-side, over the already-loaded notes. */}
      {prominent && notes.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-md border border-border bg-surface-1 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-jubo-navy"
          />
        </div>
      )}

      {/* Timeline */}
      {notes.length === 0 && !saving ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <StickyNote className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No notes yet. Add the first note for this contact or loan file.</p>
        </div>
      ) : visible.length === 0 ? (
        <p className="px-1 py-2 text-center text-2xs text-muted-foreground">No notes match “{query.trim()}”.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((n, i) => (
            <div key={n.id}>
              {prominent && dayBucket(n.created_at) !== (i > 0 ? dayBucket(visible[i - 1].created_at) : null) && (
                <div className="mb-1.5 mt-1 flex items-center gap-2" aria-hidden>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{dayBucket(n.created_at)}</span>
                  <span className="h-px flex-1 bg-border/70" />
                </div>
              )}
              <NoteItem
                note={n}
                canEdit={!!currentUserId && n.author_user_id === currentUserId}
                authorName={nameOf(n.author_user_id)}
                showMeta={prominent}
                taskContext={taskContext}
                organizationId={organizationId}
                recordId={recordId}
                onAfter={afterChange}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Today / Yesterday / Earlier bucket for the timeline separators. */
function dayBucket(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000)
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return 'Earlier'
}

/** Absolute short timestamp ("Jul 6, 11:42 AM") with an honest fallback. */
function noteStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Date unavailable'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function NoteDraft({
  value, onChange, onSubmit, onCancel, autoFocus, members, large, saving,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  autoFocus?: boolean
  members?: { id: string; name: string }[]
  large?: boolean
  saving?: boolean
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
    <div className={cn('relative rounded-lg border border-border bg-card p-2 space-y-2', large && 'border-jubo-border-strong/60 shadow-sm')}>
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
        rows={large ? 5 : 3}
        disabled={saving}
        className={cn(
          'w-full px-2 py-1.5 rounded-md bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none whitespace-pre-wrap disabled:opacity-60',
          large ? 'text-sm leading-relaxed' : 'text-sm',
        )}
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
        <p className="text-2xs text-muted-foreground">⌘⏎ to save · esc to {large ? 'clear' : 'cancel'}</p>
        <div className="flex items-center gap-1">
          {value.trim() && (
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
            >
              {large ? 'Clear' : 'Cancel'}
            </button>
          )}
          <button
            onClick={onSubmit}
            disabled={!value.trim() || saving}
            className={cn(
              'rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors',
              large ? 'flex items-center gap-1.5 px-3 py-1.5 text-xs' : 'px-2 py-1 text-2xs',
            )}
          >
            {saving ? (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>) : large ? (<><Plus className="h-3 w-3" /> Add note</>) : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function NoteItem({
  note, canEdit, authorName, showMeta, taskContext, organizationId, recordId, onAfter,
}: {
  note: NoteRow
  canEdit: boolean
  authorName: string | null
  showMeta: boolean
  taskContext?: { boardId: string }
  organizationId: string
  recordId: string
  onAfter: () => void
}) {
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(note.content)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  // Per-note task creation state — 'done' locks the button so repeat clicks
  // can never create duplicate tasks in this session.
  const [taskState, setTaskState] = useState<'idle' | 'saving' | 'done'>('idle')
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
      } catch { /* the finish() save below retries and surfaces failures */ }
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
      updateNote(note.id, content)
        .then(() => { lastSavedRef.current = content; onAfter() })
        .catch((e) => toast.error(`Couldn't save note edit — ${e instanceof Error ? e.message : 'please try again'}`))
    } else {
      onAfter()
    }
    setEditing(false)
  }

  const handleDelete = () => {
    if (!confirm('Delete this note?')) return
    deleteNote(note.id)
      .then(onAfter)
      .catch((e) => toast.error(`Couldn't delete note — ${e instanceof Error ? e.message : 'please try again'}`))
  }

  // Explicit, per-click task creation from this note (existing createTask
  // action; title = first line of the note). Never runs automatically.
  const handleCreateTask = () => {
    if (!taskContext || taskState !== 'idle') return
    const title = note.content.split('\n')[0].slice(0, 120).trim()
    if (!title) return
    setTaskState('saving')
    createTask({ organization_id: organizationId, record_id: recordId, board_id: taskContext.boardId, title })
      .then(() => { setTaskState('done'); toast.success('Task created from note'); onAfter() })
      .catch((e) => { setTaskState('idle'); toast.error(`Couldn't create task — ${e instanceof Error ? e.message : 'please try again'}`) })
  }

  const edited = new Date(note.updated_at).getTime() - new Date(note.created_at).getTime() > 60_000

  return (
    <div className="group rounded-lg border border-border bg-card p-3 space-y-1.5">
      {/* Author + created time header (Contact Card mode) — real data only. */}
      {showMeta && !editing && (authorName || note.created_at) && (
        <div className="flex items-baseline justify-between gap-2 text-2xs">
          <span className="truncate font-semibold text-foreground/80">{authorName ?? ''}</span>
          <span className="flex-shrink-0 text-muted-foreground" title={edited ? `Edited ${noteStamp(note.updated_at)}` : undefined}>
            {noteStamp(note.created_at)}{edited ? ' · edited' : ''}
          </span>
        </div>
      )}
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
            className="w-full px-2 py-1.5 rounded-md bg-surface-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none whitespace-pre-wrap"
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
              'text-sm text-foreground whitespace-pre-wrap break-words',
              canEdit && 'cursor-text',
            )}
          >
            {note.content || <span className="text-muted-foreground italic">Empty note — click to edit</span>}
          </p>
          <div className="flex items-center justify-between text-2xs text-muted-foreground">
            <span>{formatDistanceToNow(note.updated_at)}</span>
            <span className="flex items-center gap-0.5">
              {taskContext && (
                taskState === 'done' ? (
                  <span className="flex items-center gap-1 px-1 text-jubo-green"><Check className="h-3 w-3" /> Task</span>
                ) : (
                  <button
                    onClick={handleCreateTask}
                    disabled={taskState === 'saving'}
                    title="Create a task from this note"
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded px-1 py-1 text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all disabled:opacity-60"
                  >
                    {taskState === 'saving' ? <Loader2 className="h-3 w-3 animate-spin" /> : <ListChecks className="w-3 h-3" />}
                  </button>
                )
              )}
              {canEdit && (
                <button
                  onClick={handleDelete}
                  title="Delete"
                  className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
