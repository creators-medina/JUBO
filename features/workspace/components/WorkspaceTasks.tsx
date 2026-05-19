'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, Circle, Trash2, Plus, AlertTriangle, Calendar, Clock,
  ChevronDown, ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createTask, completeTask, reopenTask } from '@/features/tasks/actions'
import type { TaskPriority } from '@/types/database'

interface Task {
  id: string
  title: string
  description?: string | null
  priority: TaskPriority
  due_date: string | null
  completed_at: string | null
  record_id: string | null
}

interface Props {
  recordId: string
  organizationId: string
  boardId: string
  tasks: Task[]
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high:   'bg-orange-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
  none:   'bg-zinc-500',
}
const PRIORITY_PILL: Record<string, string> = {
  urgent: 'text-red-400',
  high:   'text-orange-400',
  medium: 'text-amber-400',
  low:    'text-blue-400',
  none:   'text-muted-foreground',
}

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'medium', 'low', 'none']

type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date'

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue:    'Overdue',
  today:      'Today',
  tomorrow:   'Tomorrow',
  this_week:  'This week',
  later:      'Later',
  no_date:    'No date',
}

function bucketForTask(t: Task, now: Date): DueBucket {
  if (!t.due_date) return 'no_date'
  const due = new Date(t.due_date)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)

  if (due < today) return 'overdue'
  if (due < tomorrow) return 'today'
  if (due < new Date(tomorrow.getTime() + 86_400_000)) return 'tomorrow'
  if (due < weekEnd) return 'this_week'
  return 'later'
}

export function WorkspaceTasks({ recordId, organizationId, boardId, tasks }: Props) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(true)
  const [, startTransition] = useTransition()

  const now = new Date()

  const openTasks = useMemo(() => tasks.filter(t => !t.completed_at), [tasks])
  const doneTasks = useMemo(() => tasks.filter(t => t.completed_at), [tasks])

  const grouped = useMemo(() => {
    const buckets = new Map<DueBucket, Task[]>()
    for (const t of openTasks) {
      const b = bucketForTask(t, now)
      const cur = buckets.get(b) ?? []
      cur.push(t)
      buckets.set(b, cur)
    }
    const order: DueBucket[] = ['overdue', 'today', 'tomorrow', 'this_week', 'later', 'no_date']
    return order
      .filter(b => buckets.has(b))
      .map(b => ({
        bucket: b,
        items: (buckets.get(b) ?? []).sort((a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99)),
      }))
  }, [openTasks, now])

  const handleToggle = (task: Task) => {
    startTransition(async () => {
      try {
        if (task.completed_at) {
          await reopenTask(task.id, boardId)
        } else {
          await completeTask(task.id, recordId, organizationId, boardId)
        }
        router.refresh()
      } catch {}
    })
  }

  return (
    <div className="space-y-3">
      {/* Quick add */}
      {showAdd ? (
        <QuickAddTask
          recordId={recordId}
          organizationId={organizationId}
          boardId={boardId}
          onDone={() => { setShowAdd(false); router.refresh() }}
          onCancel={() => setShowAdd(false)}
        />
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add a task
        </button>
      )}

      {/* Open tasks grouped */}
      {grouped.length === 0 && doneTasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Circle className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No tasks yet.</p>
        </div>
      ) : (
        <>
          {grouped.map(g => (
            <div key={g.bucket} className="space-y-1.5">
              <div className={cn(
                'flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider',
                g.bucket === 'overdue' ? 'text-red-400' :
                g.bucket === 'today'   ? 'text-amber-400' :
                                         'text-muted-foreground',
              )}>
                {g.bucket === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                {g.bucket === 'today' && <Clock className="w-3 h-3" />}
                {g.bucket === 'no_date' && <Calendar className="w-3 h-3" />}
                {BUCKET_LABEL[g.bucket]}
                <span className="text-muted-foreground/60">· {g.items.length}</span>
              </div>
              <div className="space-y-1">
                {g.items.map(t => <TaskRow key={t.id} task={t} onToggle={() => handleToggle(t)} now={now} />)}
              </div>
            </div>
          ))}

          {doneTasks.length > 0 && (
            <button
              onClick={() => setHideCompleted(v => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {hideCompleted ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {hideCompleted ? 'Show' : 'Hide'} completed ({doneTasks.length})
            </button>
          )}
          {!hideCompleted && doneTasks.length > 0 && (
            <div className="space-y-1">
              {doneTasks.map(t => <TaskRow key={t.id} task={t} onToggle={() => handleToggle(t)} now={now} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, now }: { task: Task; onToggle: () => void; now: Date }) {
  const completed = !!task.completed_at
  const overdue = !completed && task.due_date && new Date(task.due_date) < new Date(now.toISOString().slice(0, 10) + 'T00:00:00')

  return (
    <div className={cn(
      'group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md border transition-colors',
      completed ? 'bg-surface-1/30 border-border/50 opacity-60' : 'bg-card border-border hover:border-border/80',
    )}>
      <button
        onClick={onToggle}
        title={completed ? 'Reopen' : 'Complete'}
        className={cn(
          'flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
          completed
            ? 'bg-emerald-500 border-emerald-500 text-emerald-50'
            : 'border-border hover:border-primary hover:bg-primary/5',
        )}
      >
        {completed && <Check className="w-2.5 h-2.5" />}
      </button>

      <span className={cn('w-1 h-1 rounded-full flex-shrink-0', PRIORITY_DOT[task.priority])} />

      <span className={cn(
        'flex-1 text-sm truncate',
        completed ? 'line-through text-muted-foreground' : 'text-foreground',
      )}>
        {task.title}
      </span>

      {task.priority !== 'none' && !completed && (
        <span className={cn('text-2xs font-medium uppercase tracking-wider', PRIORITY_PILL[task.priority])}>
          {task.priority.slice(0, 3)}
        </span>
      )}
      {task.due_date && !completed && (
        <span className={cn('text-2xs tabular-nums', overdue ? 'text-red-400' : 'text-muted-foreground')}>
          {formatDue(task.due_date, now)}
        </span>
      )}
    </div>
  )
}

function formatDue(iso: string, now: Date): string {
  const due = new Date(iso)
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  if (due < today) {
    const days = Math.floor((today.getTime() - due.getTime()) / 86_400_000)
    return days === 0 ? 'today' : `${days}d overdue`
  }
  if (due < tomorrow) return 'today'
  if (due < new Date(tomorrow.getTime() + 86_400_000)) return 'tomorrow'
  return due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function QuickAddTask({
  recordId, organizationId, boardId, onDone, onCancel,
}: {
  recordId: string
  organizationId: string
  boardId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState<string>('')
  const [isPending, startTransition] = useTransition()

  const submit = () => {
    if (!title.trim()) return
    startTransition(async () => {
      try {
        await createTask({
          organization_id: organizationId,
          record_id: recordId,
          title: title.trim(),
          priority,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          board_id: boardId,
        })
        onDone()
      } catch {}
    })
  }

  return (
    <div className="rounded-lg border border-border bg-card p-2 space-y-2">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') onCancel()
        }}
        autoFocus
        placeholder="New task…"
        className="w-full px-2 py-1.5 rounded-md bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
      <div className="flex items-center gap-1.5">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as TaskPriority)}
          className="px-2 py-1 rounded bg-surface-1 border border-border text-2xs text-foreground capitalize focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="px-2 py-1 rounded bg-surface-1 border border-border text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onCancel}
            className="px-2 py-1 rounded text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2">
            Cancel
          </button>
          <button onClick={submit} disabled={!title.trim() || isPending}
            className="px-2 py-1 rounded bg-primary text-primary-foreground text-2xs font-medium hover:bg-primary/90 disabled:opacity-50">
            {isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
