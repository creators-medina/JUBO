'use client'

// ─────────────────────────────────────────────────────────────────────────
// Contact Card Layout 4a — the two SIDE cards of the trifold workspace and
// their collapse/spine behavior. Layout + IA only:
//
//   • ConversationsCard (left) — the EXISTING Feed timeline + Composer +
//     filter pills + Log Call, re-housed as a floating card. Same data,
//     same send/log endpoints (SMSComposeBox, createNote/createTask via
//     the card footer, quickCallOutcome).
//   • NotesTasksCard (right) — the EXISTING NoteList (prominent mode, with
//     its composer, templates, search, and per-note Create task) and the
//     record's EXISTING tasks under a two-tab toggle, plus an add-task
//     input that calls the same createTask action the card already used.
//     Notes and tasks stay separate features — surfaced together, never
//     merged or migrated.
//   • CollapsedSpine — the folded ~84px state. Collapsed content is fully
//     UNMOUNTED (never squished): the spine renders INSTEAD of the card.
//
// No new fields, no new write paths, no CRM data changes.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { MessageSquare, StickyNote, ListChecks, ChevronLeft, ChevronRight, Loader2, Plus, PanelLeftClose, PanelRightClose } from 'lucide-react'
import type { PersonCardData } from './actions'
import type { CommunicateContext } from '@/features/communications/communicate'
import { Feed, Composer, type Filter } from './cardMessaging'
import { LogCallButton } from './QuickContact'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { createTask } from '@/features/tasks/actions'
import { useToast } from '@/features/feedback/ToastProvider'
import { cn } from '@/lib/utils'

export type SideTab = 'notes' | 'tasks'

// Narrow shape for the task fields the tasks tab reads (source is any[] —
// same narrowing the card already used for its rail).
type CardTask = { id: string; title: string; completed_at: string | null; due_date: string | null }

/** Folded side card — a narrow, slightly-3D spine that stands in for the
 *  whole card. The expanded content is NOT rendered while folded (the
 *  critical bug to avoid: content squished into the spine), so nothing can
 *  overlap or leak; clicking anywhere on the spine expands the card. */
function CollapsedSpine({
  side, title, Icon, badge, onExpand,
}: {
  side: 'left' | 'right'
  title: string
  Icon: React.ElementType
  badge?: number
  onExpand: () => void
}) {
  return (
    <div className="[perspective:900px]">
      <button
        onClick={onExpand}
        title={`Expand ${title}`}
        className={cn(
          'flex h-64 w-[84px] flex-col items-center gap-3 rounded-xl border border-jubo-border-strong/60 bg-jubo-card py-3.5 shadow-md transition-all hover:shadow-lg',
          side === 'left' ? '[transform:rotateY(16deg)]' : '[transform:rotateY(-16deg)]',
        )}
      >
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-jubo-red text-white shadow-sm">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span
          className={cn(
            'min-h-0 flex-1 truncate text-[10px] font-bold uppercase tracking-[0.2em] text-jubo-muted [writing-mode:vertical-rl]',
            side === 'left' && 'rotate-180',
          )}
        >
          {title}
        </span>
        {badge != null && badge > 0 && (
          <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-jubo-red px-1 text-[10px] font-bold tabular-nums text-white">
            {badge}
          </span>
        )}
        <span className="flex-shrink-0 text-jubo-muted" aria-hidden>
          {side === 'left' ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </span>
      </button>
    </div>
  )
}

/** LEFT card — Conversations: the existing thread (Feed) with its filter
 *  pills and the existing 4-mode Composer sitting directly below the
 *  latest message (the thread scrolls internally; the composer is never
 *  pinned to the card's far bottom). Log Call keeps living here since the
 *  standalone Quick Contact bar is gone from this view. */
export function ConversationsCard(props: {
  collapsed: boolean
  onToggle: () => void
  card: PersonCardData
  comms: CommunicateContext | undefined
  recordId: string
  email: string | null
  borrowerName: string
  ownerName: string | null
  filter: Filter
  onFilterChange: (f: Filter) => void
  onChanged: () => void
  composerMode: 'sms' | 'email' | 'note' | 'task'
  onComposerModeChange: (m: 'sms' | 'email' | 'note' | 'task') => void
  composerText: string
  onComposerTextChange: (t: string) => void
  onComposerSubmit: () => void
  onSmsDraftChange: (t: string) => void
  anchorRef?: React.Ref<HTMLDivElement>
}) {
  const {
    collapsed, onToggle, card, comms, recordId, email, borrowerName, ownerName,
    filter, onFilterChange, onChanged,
    composerMode, onComposerModeChange, composerText, onComposerTextChange, onComposerSubmit, onSmsDraftChange,
    anchorRef,
  } = props

  if (collapsed) {
    return <CollapsedSpine side="left" title="Conversations" Icon={MessageSquare} onExpand={onToggle} />
  }

  return (
    <div ref={anchorRef} className="flex min-h-0 flex-col self-start overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-lg">
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-jubo-border/60 px-3 py-2">
        <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-jubo-red" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-jubo-navy">Conversations</p>
        <button
          onClick={onToggle}
          title="Collapse Conversations"
          className="rounded-md p-1 text-jubo-muted transition-colors hover:bg-jubo-card-soft hover:text-jubo-text"
        >
          <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-jubo-border/60 px-3 py-1.5">
        <div className="flex gap-0.5 rounded-lg bg-jubo-card-soft p-0.5">
          {(['all', 'comms', 'pipeline'] as Filter[]).map((f) => (
            <button key={f} onClick={() => onFilterChange(f)}
              className={cn('rounded-md px-2 py-0.5 text-2xs font-medium capitalize transition-colors',
                filter === f ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:text-foreground')}>{f}</button>
          ))}
        </div>
        <div className="ml-auto">
          <LogCallButton
            recordId={recordId}
            onLogged={onChanged}
            className="inline-flex items-center gap-1 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-2xs font-semibold text-jubo-text transition-colors hover:bg-white/60 disabled:opacity-60"
          />
        </div>
      </div>
      {/* Thread — oldest → newest with day separators (existing Feed);
          scrolls internally so the composer sits right under the latest
          message rather than being pushed to the card's bottom. */}
      <div className="min-h-0 overflow-y-auto">
        <Feed card={card} comms={comms} filter={filter} borrowerName={borrowerName} ownerName={ownerName} flow />
        <div className="border-t border-jubo-border/60 p-2.5">
          <Composer
            recordId={recordId}
            comms={comms}
            email={email}
            onChanged={onChanged}
            mode={composerMode}
            onModeChange={onComposerModeChange}
            text={composerText}
            onTextChange={onComposerTextChange}
            onSubmit={onComposerSubmit}
            onSmsDraftChange={onSmsDraftChange}
          />
        </div>
      </div>
    </div>
  )
}

/** RIGHT card — Notes & Tasks under a two-tab toggle. Notes = the existing
 *  NoteList in prominent mode (composer on top, quick templates, search,
 *  per-note Create task — all existing behavior). Tasks = the record's
 *  existing tasks with due dates plus an add-task input calling the same
 *  createTask action the card's composer already used. */
export function NotesTasksCard(props: {
  collapsed: boolean
  onToggle: () => void
  activeTab: SideTab
  onTabChange: (t: SideTab) => void
  organizationId: string
  recordId: string
  boardId: string | null
  comms: CommunicateContext | undefined
  tasks: CardTask[]
  openTaskCount: number
  onChanged: () => void
}) {
  const {
    collapsed, onToggle, activeTab, onTabChange,
    organizationId, recordId, boardId, comms, tasks, openTaskCount, onChanged,
  } = props

  if (collapsed) {
    return <CollapsedSpine side="right" title="Notes & Tasks" Icon={StickyNote} badge={openTaskCount} onExpand={onToggle} />
  }

  return (
    <div className="flex min-h-0 flex-col self-start overflow-hidden rounded-2xl border border-jubo-border-strong/60 bg-jubo-card shadow-lg">
      {/* Tab row — collapse control at the LEFT of the tabs (brief). */}
      <div className="flex flex-shrink-0 items-center gap-1 border-b border-jubo-border/60 px-2 py-1.5">
        <button
          onClick={onToggle}
          title="Collapse Notes & Tasks"
          className="rounded-md p-1 text-jubo-muted transition-colors hover:bg-jubo-card-soft hover:text-jubo-text"
        >
          <PanelRightClose className="h-3.5 w-3.5" aria-hidden />
        </button>
        <div className="flex flex-1 gap-0.5 rounded-lg bg-jubo-card-soft p-0.5">
          <button
            onClick={() => onTabChange('notes')}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              activeTab === 'notes' ? 'bg-jubo-navy text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <StickyNote className="h-3 w-3" aria-hidden /> Notes
          </button>
          <button
            onClick={() => onTabChange('tasks')}
            className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
              activeTab === 'tasks' ? 'bg-jubo-navy text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <ListChecks className="h-3 w-3" aria-hidden /> Tasks
            {openTaskCount > 0 && (
              <span className={cn('flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums',
                activeTab === 'tasks' ? 'bg-white/20 text-white' : 'bg-jubo-red text-white')}>
                {openTaskCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto p-3">
        {activeTab === 'notes' ? (
          comms ? (
            <NoteList
              organizationId={organizationId}
              recordId={recordId}
              notes={comms.notes}
              currentUserId={comms.currentUserId}
              members={comms.members}
              prominent
              taskContext={boardId ? { boardId } : undefined}
              onChanged={onChanged}
            />
          ) : (
            <div className="flex items-center gap-2 py-2 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>
          )
        ) : (
          <TasksTab
            organizationId={organizationId}
            recordId={recordId}
            boardId={boardId}
            tasks={tasks}
            onChanged={onChanged}
          />
        )}
      </div>
    </div>
  )
}

/** Tasks tab — add-task composer on top (existing createTask write path,
 *  identical args to the card composer's Task mode), open tasks by due
 *  date below, completed tasks last. Display stays read-only, matching the
 *  card's existing task rail (no new toggle/complete write behavior). */
function TasksTab({
  organizationId, recordId, boardId, tasks, onChanged,
}: {
  organizationId: string
  recordId: string
  boardId: string | null
  tasks: CardTask[]
  onChanged: () => void
}) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [saving, startSave] = useTransition()

  const open = tasks
    .filter((t) => !t.completed_at)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
  const done = tasks.filter((t) => t.completed_at)

  const addTask = () => {
    const title = draft.trim()
    if (!title || !boardId || saving) return
    startSave(async () => {
      try {
        await createTask({ organization_id: organizationId, record_id: recordId, board_id: boardId, title })
        setDraft('')
        onChanged()
      } catch (e) {
        // Draft kept — never silently lost.
        toast.error(`Couldn't add task — ${e instanceof Error ? e.message : 'please try again'}`)
      }
    })
  }

  return (
    <div className="space-y-3">
      {boardId && (
        <div className="flex gap-1.5">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTask() }}
            placeholder="Add a task…"
            disabled={saving}
            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy disabled:opacity-60"
          />
          <button
            onClick={addTask}
            disabled={!draft.trim() || saving}
            className="flex flex-shrink-0 items-center gap-1 rounded-md bg-jubo-red px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-jubo-red-dark disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Plus className="h-3 w-3" aria-hidden />} Add
          </button>
        </div>
      )}

      {open.length === 0 && done.length === 0 ? (
        <p className="py-4 text-center text-2xs italic text-jubo-muted">No tasks yet.</p>
      ) : (
        <div className="space-y-1.5">
          {open.map((t) => <TaskRowItem key={t.id} task={t} />)}
          {done.length > 0 && (
            <>
              <p className="pt-2 text-[10px] font-semibold uppercase tracking-wider text-jubo-muted/70">Completed</p>
              {done.map((t) => <TaskRowItem key={t.id} task={t} done />)}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function TaskRowItem({ task, done }: { task: CardTask; done?: boolean }) {
  const overdue = !done && task.due_date && new Date(task.due_date) < new Date()
  return (
    <div className={cn('flex items-center gap-2 rounded-lg border border-jubo-border/60 bg-jubo-card px-2.5 py-1.5', done && 'opacity-60')}>
      <span className={cn('min-w-0 flex-1 truncate text-xs', done ? 'text-jubo-muted line-through' : 'text-jubo-text')}>{task.title}</span>
      {task.due_date && (
        <span className={cn('flex-shrink-0 text-2xs tabular-nums', overdue ? 'font-semibold text-jubo-red' : 'text-jubo-muted')}>
          {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
    </div>
  )
}
