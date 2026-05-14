'use client'

import { useEffect, useState, useTransition, useRef } from 'react'
import { X, Clock, ArrowRight, CheckSquare, Square, Plus, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { updateRecord, upsertFieldValue } from '@/features/records/actions'
import { createTask, completeTask, reopenTask } from '@/features/tasks/actions'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { RecordStatus, RecordPriority, TaskPriority } from '@/types/database'

// ── Editable text cell ──────────────────────────────────────
function EditableText({
  value,
  onSave,
  placeholder = '—',
  multiline = false,
  className,
}: {
  value: string
  onSave: (v: string) => Promise<void>
  placeholder?: string
  multiline?: boolean
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try { await onSave(draft) } finally { setSaving(false); setEditing(false) }
  }

  const commonProps = {
    ref,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) save()
      if (e.key === 'Escape') { setDraft(value); setEditing(false) }
    },
    className: cn('w-full bg-surface-1 border border-primary rounded px-2 py-1 text-sm text-foreground focus:outline-none resize-none', className),
  }

  if (editing) {
    return multiline
      ? <textarea {...commonProps} rows={3} />
      : <input type="text" {...commonProps} />
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        'cursor-pointer hover:text-foreground text-sm rounded px-1 -mx-1 hover:bg-surface-2 transition-colors block truncate',
        !value && 'text-muted-foreground italic',
        className
      )}
    >
      {saving ? <Loader2 className="w-3 h-3 animate-spin inline" /> : (value || placeholder)}
    </span>
  )
}

// ── Editable select cell ─────────────────────────────────────
function EditableSelect<T extends string>({
  value,
  options,
  onSave,
  className,
}: {
  value: T
  options: { value: T; label: string }[]
  onSave: (v: T) => Promise<void>
  className?: string
}) {
  const [saving, setSaving] = useState(false)

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSaving(true)
    try { await onSave(e.target.value as T) } finally { setSaving(false) }
  }

  return (
    <div className="relative flex items-center gap-1">
      <select
        value={value}
        onChange={handleChange}
        disabled={saving}
        className={cn(
          'bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary capitalize cursor-pointer',
          className
        )}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {saving && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
    </div>
  )
}

// ── Field value editor ───────────────────────────────────────
function FieldValueEditor({
  field,
  fv,
  onSave,
}: {
  field: any
  fv: any | null
  onSave: (value: object) => Promise<void>
}) {
  const ft = field.field_type

  const currentText = fv?.value_text ?? ''
  const currentNumber = fv?.value_number ?? ''
  const currentBool = fv?.value_boolean ?? null
  const currentDate = fv?.value_date ? fv.value_date.split('T')[0] : ''

  if (ft === 'boolean') {
    return (
      <select
        defaultValue={currentBool === null ? '' : String(currentBool)}
        onChange={async e => {
          const v = e.target.value
          await onSave({ value_boolean: v === '' ? null : v === 'true' })
        }}
        className="bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary"
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    )
  }

  if (ft === 'select' && field.config?.options) {
    return (
      <select
        defaultValue={currentText}
        onChange={async e => await onSave({ value_text: e.target.value || null })}
        className="bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary"
      >
        <option value="">—</option>
        {(field.config.options as string[]).map((o: string) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    )
  }

  if (ft === 'date' || ft === 'datetime') {
    return (
      <input
        type="date"
        defaultValue={currentDate}
        onBlur={async e => await onSave({ value_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
        className="bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary"
      />
    )
  }

  if (ft === 'number' || ft === 'currency') {
    return (
      <input
        type="number"
        defaultValue={String(currentNumber)}
        onBlur={async e => await onSave({ value_number: e.target.value ? parseFloat(e.target.value) : null })}
        className="bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary w-32"
      />
    )
  }

  if (ft === 'textarea') {
    return (
      <textarea
        defaultValue={currentText}
        rows={2}
        onBlur={async e => await onSave({ value_text: e.target.value || null })}
        className="w-full bg-surface-1 border border-border rounded px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary resize-none"
      />
    )
  }

  // text, email, phone, url, multiselect fallback
  return (
    <input
      type={ft === 'email' ? 'email' : ft === 'phone' ? 'tel' : ft === 'url' ? 'url' : 'text'}
      defaultValue={currentText}
      onBlur={async e => await onSave({ value_text: e.target.value || null })}
      className="w-full bg-surface-1 border border-border rounded px-2 py-0.5 text-xs text-foreground focus:outline-none focus:border-primary"
    />
  )
}

// ── Task row ─────────────────────────────────────────────────
function TaskRow({
  task,
  organizationId,
  recordId,
  boardId,
  onToggle,
}: {
  task: any
  organizationId: string
  recordId: string
  boardId: string
  onToggle: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const done = !!task.completed_at

  const toggle = () => {
    startTransition(async () => {
      if (done) await reopenTask(task.id, boardId)
      else await completeTask(task.id, recordId, organizationId, boardId)
      onToggle()
    })
  }

  return (
    <div className={cn('flex items-start gap-2.5 py-1.5 group', done && 'opacity-60')}>
      <button
        onClick={toggle}
        disabled={isPending}
        className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors"
      >
        {isPending
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : done
            ? <CheckSquare className="w-3.5 h-3.5 text-primary" />
            : <Square className="w-3.5 h-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs text-foreground', done && 'line-through')}>{task.title}</p>
        {task.due_date && (
          <p className="text-2xs text-muted-foreground mt-0.5">Due {new Date(task.due_date).toLocaleDateString()}</p>
        )}
      </div>
      {task.priority !== 'none' && (
        <span className={cn(
          'text-2xs px-1 py-0.5 rounded capitalize flex-shrink-0',
          task.priority === 'high' ? 'bg-amber-500/20 text-amber-400' :
          task.priority === 'medium' ? 'bg-blue-500/20 text-blue-400' :
          'text-muted-foreground'
        )}>{task.priority}</span>
      )}
    </div>
  )
}

// ── Add task form ─────────────────────────────────────────────
function AddTaskForm({
  organizationId,
  recordId,
  boardId,
  onAdded,
}: {
  organizationId: string
  recordId: string
  boardId: string
  onAdded: (task: any) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('none')
  const [isPending, startTransition] = useTransition()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    startTransition(async () => {
      const task = await createTask({
        organization_id: organizationId,
        record_id: recordId,
        board_id: boardId,
        title: title.trim(),
        due_date: dueDate || null,
        priority,
      })
      onAdded(task)
      setTitle('')
      setDueDate('')
      setPriority('none')
      setOpen(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Add task
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-2 mt-1">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Task title"
        autoFocus
        className="w-full px-2 py-1.5 text-xs bg-surface-1 border border-border rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="flex-1 px-2 py-1 text-xs bg-surface-1 border border-border rounded text-foreground focus:outline-none focus:border-primary"
        />
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as TaskPriority)}
          className="px-2 py-1 text-xs bg-surface-1 border border-border rounded text-foreground focus:outline-none focus:border-primary"
        >
          <option value="none">No priority</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isPending || !title.trim()} className="h-7 text-xs">
          {isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Add
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}

// ── STATUS & PRIORITY options ────────────────────────────────
const STATUS_OPTIONS: { value: RecordStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'archived', label: 'Archived' },
]

const PRIORITY_OPTIONS: { value: RecordPriority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

// ── Main drawer ───────────────────────────────────────────────
interface Props {
  recordId: string
  groups: any[]
  boardId: string
  organizationId: string
  onClose: () => void
}

export function RecordDetailDrawer({ recordId, groups, boardId, organizationId, onClose }: Props) {
  const [record, setRecord] = useState<any>(null)
  const [fieldValues, setFieldValues] = useState<any[]>([])
  const [fields, setFields] = useState<any[]>([])
  const [activities, setActivities] = useState<any[]>([])
  const [movements, setMovements] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const supabase = createClient()
    const [rRes, fvRes, fieldsRes, aRes, mRes, tRes] = await Promise.all([
      supabase.from('records').select('*').eq('id', recordId).single(),
      supabase.from('field_values').select('*, fields(id, name, slug, field_type, config)').eq('record_id', recordId),
      supabase.from('fields').select('*').eq('board_id', boardId).order('position'),
      supabase.from('activities').select('*').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20),
      supabase.from('record_movements').select('*, from_group:from_group_id(name), to_group:to_group_id(name)').eq('record_id', recordId).order('created_at', { ascending: false }),
      supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: true }),
    ])
    setRecord(rRes.data)
    setFieldValues(fvRes.data ?? [])
    setFields(fieldsRes.data ?? [])
    setActivities(aRes.data ?? [])
    setMovements(mRes.data ?? [])
    setTasks(tRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [recordId])

  const groupName = (id: string | null) => groups.find(g => g.id === id)?.name ?? '—'

  const fvForField = (fieldId: string) => fieldValues.find(fv => fv.field_id === fieldId) ?? null

  const handleUpdateRecord = async (
    updates: Parameters<typeof updateRecord>[2],
    previousValues?: Record<string, unknown>
  ) => {
    await updateRecord(recordId, boardId, updates, previousValues)
    setRecord((r: any) => ({ ...r, ...updates }))
  }

  const handleUpsertField = async (fieldId: string, value: object) => {
    await upsertFieldValue(fieldId, recordId, boardId, value)
    setFieldValues(prev => {
      const existing = prev.findIndex(fv => fv.field_id === fieldId)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = { ...updated[existing], ...value }
        return updated
      }
      return [...prev, { field_id: fieldId, record_id: recordId, ...value }]
    })
  }

  const openTasks = tasks.filter(t => !t.completed_at)
  const doneTasks = tasks.filter(t => t.completed_at)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l border-border flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          {loading ? (
            <div className="h-5 w-48 bg-surface-2 rounded animate-pulse" />
          ) : (
            <EditableText
              value={record?.title ?? ''}
              onSave={v => handleUpdateRecord({ title: v }, { title: record?.title })}
              placeholder="Record title"
              className="text-base font-semibold text-foreground flex-1 mr-4"
            />
          )}
          <button
            onClick={onClose}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="p-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-8 bg-surface-1 rounded animate-pulse"
                style={{ opacity: 1 - i * 0.15 }}
              />
            ))}
          </div>
        )}

        {!loading && record && (
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {/* Core fields */}
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Group</span>
                <span className="text-xs text-foreground">{groupName(record.group_id)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Status</span>
                <EditableSelect
                  value={record.status as RecordStatus}
                  options={STATUS_OPTIONS}
                  onSave={v => handleUpdateRecord({ status: v }, { status: record.status })}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Priority</span>
                <EditableSelect
                  value={record.priority as RecordPriority}
                  options={PRIORITY_OPTIONS}
                  onSave={v => handleUpdateRecord({ priority: v }, { priority: record.priority })}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Value</span>
                <EditableText
                  value={record.value != null ? String(record.value) : ''}
                  onSave={v => handleUpdateRecord({ value: v ? parseFloat(v) : null }, { value: record.value })}
                  placeholder="—"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-24 flex-shrink-0">Created</span>
                <span className="text-xs text-muted-foreground">{new Date(record.created_at).toLocaleString()}</span>
              </div>
            </div>

            {/* Dynamic fields */}
            {fields.length > 0 && (
              <div className="px-5 py-4 space-y-3">
                <p className="text-xs font-semibold text-foreground">Fields</p>
                {fields.map(field => (
                  <div key={field.id} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-24 flex-shrink-0 pt-0.5">{field.name}</span>
                    <div className="flex-1 min-w-0">
                      <FieldValueEditor
                        field={field}
                        fv={fvForField(field.id)}
                        onSave={value => handleUpsertField(field.id, value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tasks */}
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-foreground mb-3">
                Tasks
                {openTasks.length > 0 && (
                  <span className="ml-1.5 text-muted-foreground font-normal">({openTasks.length} open)</span>
                )}
              </p>
              <div className="space-y-0.5">
                {openTasks.map(task => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    organizationId={organizationId}
                    recordId={recordId}
                    boardId={boardId}
                    onToggle={() => setTasks(ts => ts.map(t =>
                      t.id === task.id ? { ...t, completed_at: new Date().toISOString() } : t
                    ))}
                  />
                ))}
                {doneTasks.length > 0 && (
                  <div className="mt-2">
                    <p className="text-2xs text-muted-foreground mb-1">{doneTasks.length} completed</p>
                    {doneTasks.map(task => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        organizationId={organizationId}
                        recordId={recordId}
                        boardId={boardId}
                        onToggle={() => setTasks(ts => ts.map(t =>
                          t.id === task.id ? { ...t, completed_at: null } : t
                        ))}
                      />
                    ))}
                  </div>
                )}
              </div>
              <AddTaskForm
                organizationId={organizationId}
                recordId={recordId}
                boardId={boardId}
                onAdded={task => setTasks(ts => [...ts, task])}
              />
            </div>

            {/* Movement history */}
            {movements.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-foreground mb-3">Movement history</p>
                <div className="space-y-2">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{m.from_group?.name ?? '—'}</span>
                      <ArrowRight className="w-3 h-3 flex-shrink-0" />
                      <span className="text-foreground">{m.to_group?.name ?? '—'}</span>
                      <span className="ml-auto flex-shrink-0 text-2xs">{new Date(m.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity */}
            {activities.length > 0 && (
              <div className="px-5 py-4">
                <p className="text-xs font-semibold text-foreground mb-3">Activity</p>
                <div className="space-y-3">
                  {activities.map(a => (
                    <div key={a.id} className="flex gap-2.5">
                      <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs text-foreground capitalize">{a.activity_type.replace(/_/g, ' ')}</p>
                        {a.content && <p className="text-xs text-muted-foreground">{a.content}</p>}
                        <p className="text-2xs text-muted-foreground mt-0.5">{new Date(a.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
