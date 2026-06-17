'use client'

import { useState, useTransition, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, GripVertical, ChevronRight, ChevronDown, CornerDownRight, Plus } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { EditableCell } from './EditableCell'
import { NotesCell } from './NotesCell'
import { isNotesField } from '../notes'
import { moveRecord, createSubitem } from '@/features/records/actions'
import { parseOptions } from '@/features/fields/status'
import { cn } from '@/lib/utils'
import type { NotesSummary } from '@/features/workspace/notes/queries'

const STATUS_EMPTY = '#64748b'

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-500',
  none: '',
}

interface Props {
  record: any
  fields: any[]
  fieldValueMap: Record<string, any>
  groups: any[]
  boardId: string
  subitems?: any[]
  /** Phase 37B-3 — index for resolving each subitem's field values (read-only). */
  fieldValuesIndex?: Record<string, Record<string, any>>
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  onClick: () => void
  onOpenSubitem?: (id: string, title: string) => void
  onOptimisticMove?: (recordId: string, toGroupId: string) => void
  notesSummary?: NotesSummary
  onOpenNotes?: (recordId: string) => void
}

export function BoardRecordRow({ record, fields, fieldValueMap, groups, boardId, subitems = [], fieldValuesIndex, isSelected, onToggleSelect, onClick, onOpenSubitem, onOptimisticMove, notesSummary, onOpenNotes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState(false)
  const [addingSub, setAddingSub] = useState(false)
  const [subDraft, setSubDraft] = useState('')
  const hasSubitems = subitems.length > 0
  // Phase 37B-3 — total parent columns for the full-width nested row's colSpan:
  // checkbox + drag + Item + fields + actions.
  const totalColSpan = fields.length + 4
  const defaultStatusField = fields.find((f: any) => f.is_default_status)

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: `table-record:${record.id}`,
    // Phase 37B-2 — unified record-drag payload (board-aware; same shape as Kanban).
    // 37B-2E: carry the row's already-available fields + values (references, no
    // computation) so the overlay can render a full-width row shell without recompute.
    data: { type: 'record', recordId: record.id, fromGroupId: record.group_id, boardId, record, view: 'table', title: record.title, fields, fieldValueMap },
  })

  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }
    : undefined

  const handleMove = (toGroupId: string) => {
    onOptimisticMove?.(record.id, toGroupId)
    startTransition(async () => {
      try {
        await moveRecord(record.id, toGroupId, boardId)
        router.refresh()
      } catch {
        router.refresh() // rollback via server data
      }
    })
  }

  const addSubitem = () => {
    const t = subDraft.trim()
    if (!t) { setAddingSub(false); return }
    startTransition(async () => {
      try {
        await createSubitem(record.id, t)
        setSubDraft('')
        setAddingSub(false)
        router.refresh()
      } catch {
        router.refresh()
      }
    })
  }

  return (
    <Fragment>
    <tr
      ref={setDragRef}
      style={style}
      className={cn(
        'group border-b border-border cursor-pointer transition-colors',
        'hover:bg-surface-1',
        isSelected && 'bg-primary/5',
        isDragging && 'opacity-40',
        isPending && 'opacity-60'
      )}
    >
      {/* Selection checkbox */}
      <td className="w-7 pl-2 pr-0 py-2" onClick={e => e.stopPropagation()}>
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={() => onToggleSelect(record.id)}
            className={cn(
              'h-3.5 w-3.5 rounded border-border bg-surface-1 text-primary focus:ring-primary transition-opacity',
              !isSelected && 'opacity-0 group-hover:opacity-100',
            )}
          />
        )}
      </td>

      {/* Drag handle */}
      <td className="w-6 pl-1 pr-0 py-2" onClick={e => e.stopPropagation()}>
        <button
          {...attributes}
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      </td>

      {/* Title column (with subitem expand toggle) */}
      <td
        className="sticky left-0 z-10 bg-card group-hover:bg-surface-1 transition-colors px-3 py-2 min-w-[200px] max-w-[280px]"
        onClick={onClick}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
            className={cn(
              'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors',
              !hasSubitems && !expanded && 'opacity-0 group-hover:opacity-60',
            )}
            title={hasSubitems ? `${subitems.length} subitem${subitems.length === 1 ? '' : 's'}` : 'Add subitem'}
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
          {record.priority !== 'none' && PRIORITY_COLORS[record.priority] && (
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_COLORS[record.priority])} />
          )}
          <span className="text-sm font-medium text-foreground truncate">{record.title}</span>
          {hasSubitems && (
            <span className="ml-1 rounded-full bg-surface-2 px-1.5 text-2xs text-muted-foreground">{subitems.length}</span>
          )}
        </div>
      </td>

      {/* Internal records.status/priority/value are not board columns anymore
          (Phase 34A.1) — they stay system-only for archive/filtering. The
          priority dot beside the title remains as a subtle indicator. */}

      {/* Dynamic field columns — inline editable (notes columns open the panel) */}
      {fields.map(field => (
        <td key={field.id} className="px-2 py-1.5 w-36 text-xs text-foreground" onClick={e => e.stopPropagation()}>
          {isNotesField(field) ? (
            <NotesCell summary={notesSummary} onOpen={() => onOpenNotes?.(record.id)} />
          ) : (
            <EditableCell
              field={field}
              fieldValue={fieldValueMap[field.id] ?? null}
              recordId={record.id}
              boardId={boardId}
            />
          )}
        </td>
      ))}

      {/* Row actions */}
      <td className="px-2 py-2 w-8" onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-all">
            <MoreHorizontal className="w-3.5 h-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="bg-card border-border">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="text-xs">Move to group</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-card border-border">
                {groups.filter(g => g.id !== record.group_id).map(g => (
                  <DropdownMenuItem key={g.id} className="text-xs cursor-pointer" onClick={() => handleMove(g.id)}>
                    {g.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => { setExpanded(true); setAddingSub(true) }}>
              Add subitem
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>

    {/* Phase 37B-3 — nested subitem table (Branch A: real child records).
        ONE full-width spanning row with its OWN columns (Subitem | Status | Date),
        NOT aligned to the parent's board columns. This <tr> has no dnd-kit hooks,
        so it is never a drag source or drop target and never shifts row indices. */}
    {expanded && (
      <tr className="bg-surface-1/20">
        <td colSpan={totalColSpan} className="p-0">
          <div className="mb-2 ml-10 mr-3 overflow-hidden rounded-lg border border-border bg-surface-1/50">
            <div className="grid grid-cols-[1fr_140px_120px] gap-2 border-b border-border/60 bg-surface-1/70 px-3 py-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Subitem</span><span>Status</span><span>Date</span>
            </div>

            {subitems.length === 0 && !addingSub && (
              <div className="px-3 py-2 text-2xs text-muted-foreground">No subitems yet.</div>
            )}

            {subitems.map((sub) => {
              const sv = fieldValuesIndex?.[sub.id] ?? {}
              const statusLabel = defaultStatusField ? (sv[defaultStatusField.id]?.value_text ?? '') : ''
              const statusColor = statusLabel && defaultStatusField
                ? (parseOptions(defaultStatusField.config).find((o) => o.label === statusLabel)?.color || STATUS_EMPTY)
                : STATUS_EMPTY
              const date = sub.next_action_due_at ? String(sub.next_action_due_at).split('T')[0] : ''
              return (
                <div
                  key={sub.id}
                  onClick={() => onOpenSubitem?.(sub.id, sub.title)}
                  className="grid grid-cols-[1fr_140px_120px] items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-0 hover:bg-surface-2/50 cursor-pointer"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground">
                    <CornerDownRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span className="truncate">{sub.title}</span>
                  </span>
                  <span className="min-w-0">
                    {statusLabel
                      ? <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: statusColor }}>{statusLabel}</span>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{date || '—'}</span>
                </div>
              )
            })}

            {/* Inline add-subitem row (reuses createSubitem) */}
            <div className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
              {addingSub ? (
                <input
                  autoFocus
                  value={subDraft}
                  placeholder="Subitem title…"
                  onChange={(e) => setSubDraft(e.target.value)}
                  onBlur={addSubitem}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); addSubitem() }
                    if (e.key === 'Escape') { setSubDraft(''); setAddingSub(false) }
                  }}
                  className="w-full bg-transparent text-xs text-foreground focus:outline-none"
                />
              ) : (
                <button onClick={() => setAddingSub(true)} className="flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground">
                  <Plus className="h-3 w-3" /> Add subitem
                </button>
              )}
            </div>
          </div>
        </td>
      </tr>
    )}
    </Fragment>
  )
}
