'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, Check, X, MoreVertical, GripVertical, Pencil, Palette, Copy, ArrowUp, ArrowDown, Archive, Trash2, Loader2, Info, ListChecks } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { BoardRecordRow } from './BoardRecordRow'
import { updateBoardGroup, duplicateBoardGroup, archiveBoardGroup, deleteBoardGroupHard } from '@/features/boards/actions'
import { EditableColumnHeader } from './EditableColumnHeader'
import { StageChecklistModal } from './StageChecklistModal'
import { formatVolume, stageColor } from './BoardStageSummary'
import { cn } from '@/lib/utils'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#64748b']

interface Props {
  group: any
  records: any[]
  fields: any[]
  commonFieldIds?: Set<string>
  usedCommonKeyIds?: Set<string>
  checklistSummary?: { hasChecklist: boolean; avgPercentage: number }
  onReorderColumn?: (draggedId: string, targetId: string) => void
  onMoveGroup?: (groupId: string, dir: 'up' | 'down') => void
  onReorderGroup?: (draggedId: string, targetId: string) => void
  isFirstGroup?: boolean
  isLastGroup?: boolean
  fieldValuesIndex: Record<string, Record<string, any>>
  groups: any[]
  boardId: string
  hasActiveFilters: boolean
  totalCount: number
  valueTotal?: number
  emphasized?: boolean
  stageIndex?: number
  subitemsByParent?: Record<string, any[]>
  notesByRecord?: Record<string, import('@/features/workspace/notes/queries').NotesSummary>
  onOpenNotes?: (recordId: string) => void
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectMany?: (ids: string[], on: boolean) => void
  onAddRecord: () => void
  onAddField: () => void
  onSelectRecord: (id: string) => void
  onOptimisticMove: (recordId: string, toGroupId: string) => void
  /** Singular noun for add affordances — 'contact' on CRM boards, else 'record'. */
  entityNoun?: string
}

export function BoardGroupTable({
  group,
  records,
  fields,
  commonFieldIds,
  usedCommonKeyIds,
  checklistSummary,
  onReorderColumn,
  onMoveGroup,
  onReorderGroup,
  isFirstGroup,
  isLastGroup,
  fieldValuesIndex,
  groups,
  boardId,
  hasActiveFilters,
  totalCount,
  valueTotal = 0,
  emphasized = false,
  stageIndex = 0,
  subitemsByParent,
  notesByRecord,
  onOpenNotes,
  selectedIds,
  onToggleSelect,
  onToggleSelectMany,
  onAddRecord,
  onAddField,
  entityNoun = 'record',
  onSelectRecord,
  onOptimisticMove,
}: Props) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(group.name)
  const [color, setColor] = useState(group.color ?? '')
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showMenu, setShowMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Phase 5J — stage role label + quiet Guidance Note (presentation metadata).
  const [editingMeta, setEditingMeta] = useState(false)
  const [roleDraft, setRoleDraft] = useState<string>(group.role_label ?? '')
  const [guidanceDraft, setGuidanceDraft] = useState<string>(group.guidance_note ?? '')
  const [showChecklist, setShowChecklist] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setShowMenu(false); setConfirmDelete(false) } }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showMenu])

  const closeMenu = () => { setShowMenu(false); setConfirmDelete(false) }
  const groupFail = (e: unknown, msg: string) => alert(e instanceof Error ? e.message : msg)

  const onDuplicateGroup = () => {
    closeMenu()
    startTransition(async () => {
      try { await duplicateBoardGroup(group.id, boardId); router.refresh() }
      catch (e) { groupFail(e, 'Could not duplicate group') }
    })
  }
  const onArchiveGroup = () => {
    closeMenu()
    startTransition(async () => {
      try { await archiveBoardGroup(group.id, boardId); router.refresh() }
      catch (e) { groupFail(e, 'Could not archive group') }
    })
  }
  const onDeleteGroup = () => {
    closeMenu()
    startTransition(async () => {
      try { await deleteBoardGroupHard(group.id, boardId); router.refresh() }
      catch (e) { groupFail(e, 'Could not delete group') }
    })
  }

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `group-drop:${group.id}`,
    // Phase 37B-2 — unified drop payload (board-aware).
    data: { type: 'drop', groupId: group.id, boardId },
  })

  const saveName = () => {
    if (!nameDraft.trim() || nameDraft === group.name) { setEditingName(false); return }
    startTransition(async () => {
      await updateBoardGroup(group.id, boardId, { name: nameDraft.trim() })
      setEditingName(false)
      router.refresh()
    })
  }

  const saveColor = async (c: string) => {
    setColor(c)
    setShowColorPicker(false)
    await updateBoardGroup(group.id, boardId, { color: c })
    router.refresh()
  }

  // Save the stage's role label + Guidance Note. Empty → null (nothing renders).
  // Guidance is metadata only — it never becomes a checklist item or affects
  // checklist progress.
  const saveMeta = () => {
    startTransition(async () => {
      try {
        await updateBoardGroup(group.id, boardId, {
          role_label: roleDraft.trim() || null,
          guidance_note: guidanceDraft.trim() || null,
        })
        setEditingMeta(false)
        router.refresh()
      } catch (e) { groupFail(e, 'Could not save stage guidance') }
    })
  }

  const avgValue = valueTotal > 0 && totalCount > 0 ? valueTotal / totalCount : 0
  const rail = color || stageColor(group, stageIndex)

  return (
    <div className="mb-5" ref={setDropRef} id={`group-${group.id}`} style={{ scrollMarginTop: 12 }}>
      {/* Pipeline stage surface — header + table read as one object. Phase 36C:
          stage-tinted glass + a soft corner glow baked into the background, so it
          reads colorful without a pseudo/stacking-context (sticky columns + the
          z-50 group menus stay safe). */}
      <div
        className={cn(
          'relative rounded-xl border transition-colors',
          isOver ? 'border-jubo-navy/50' : emphasized ? 'border-border ring-1 ring-jubo-navy/15' : 'border-border',
        )}
        style={{
          backgroundColor: 'color-mix(in oklch, var(--surface-1) 55%, transparent)',
          backgroundImage: `radial-gradient(55% 50% at 100% 100%, ${rail}1f, transparent 62%), linear-gradient(180deg, ${rail}10, transparent 45%)`,
        }}
      >
        {/* Stage identity rail — clipped to the surface's rounded corners */}
        <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-xl" aria-hidden>
          <div
            className="absolute inset-y-0 left-0"
            style={{
              width: emphasized ? 5 : 4,
              background: `linear-gradient(180deg, ${rail}, color-mix(in srgb, ${rail} 55%, transparent))`,
              opacity: emphasized ? 1 : 0.85,
            }}
          />
        </div>

        {/* Integrated header (above the rail + table so the color popover shows) */}
        <div
          className={cn(
            'group relative z-30 flex items-center gap-2 rounded-t-xl px-4 py-2.5 pl-5 transition-colors',
            isOver && 'bg-primary/5'
          )}
          onDragOver={(e) => { if (onReorderGroup && e.dataTransfer.types.includes('text/group-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
          onDrop={(e) => {
            if (!onReorderGroup) return
            const dragged = e.dataTransfer.getData('text/group-id')
            if (dragged && dragged !== group.id) { e.preventDefault(); onReorderGroup(dragged, group.id) }
          }}
        >
        {onReorderGroup && (
          <button
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('text/group-id', group.id); e.dataTransfer.effectAllowed = 'move' }}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder group"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        <button onClick={() => setCollapsed(c => !c)} className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors">
          {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {/* Color dot / picker trigger */}
        <div className="relative">
          <button
            onClick={() => setShowColorPicker(p => !p)}
            className="w-3 h-3 rounded-sm flex-shrink-0 border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: color || '#64748b' }}
          />
          {showColorPicker && (
            <div className="absolute top-5 left-0 z-30 bg-card border border-border rounded-lg p-2 flex gap-1.5 flex-wrap w-32 shadow-xl">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => saveColor(c)}
                  className={cn('w-5 h-5 rounded-full transition-transform hover:scale-110', color === c && 'ring-2 ring-primary ring-offset-1 ring-offset-card')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Editable group name */}
        {editingName ? (
          <div className="flex items-center gap-1 flex-1">
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameDraft(group.name); setEditingName(false) } }}
              className="flex-1 bg-surface-1 border border-primary rounded px-2 py-0.5 text-sm font-semibold text-foreground focus:outline-none"
            />
            <button onClick={saveName} className="text-emerald-400 hover:text-emerald-300 transition-colors"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setNameDraft(group.name); setEditingName(false) }} className="text-muted-foreground hover:text-foreground transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
        ) : (
          <button onDoubleClick={() => setEditingName(true)} className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight" style={{ color: rail }}>{group.name}</span>
            <span
              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-2xs font-semibold tabular-nums"
              style={{ color: rail, backgroundColor: `${rail}1f` }}
            >
              {hasActiveFilters && records.length !== totalCount ? `${records.length}/${totalCount}` : totalCount}
            </span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 pr-1">
          {checklistSummary?.hasChecklist && (
            <span className="hidden sm:inline text-2xs text-muted-foreground tabular-nums" title="Average checklist completion across this group">
              Completion <span className={cn('font-medium', checklistSummary.avgPercentage === 100 ? 'text-emerald-400' : 'text-foreground')}>{checklistSummary.avgPercentage}%</span>
            </span>
          )}
          {valueTotal > 0 && (
            <span className="hidden sm:inline text-2xs text-muted-foreground tabular-nums">
              Volume <span className="font-medium text-foreground">{formatVolume(valueTotal)}</span>
              {avgValue > 0 && <> · Avg <span className="font-medium text-foreground">{formatVolume(avgValue)}</span></>}
            </span>
          )}
          {/* Keep the action controls visible while the menu (or color picker) is
              open — otherwise moving the cursor off the header row drops
              group-hover and fades the open dropdown out mid-click. */}
          <div className={cn('flex items-center gap-1 transition-opacity', (showMenu || showColorPicker) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
            <button onClick={onAddRecord} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title={`Add ${entityNoun}`}>
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu((o) => !o)}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                title="Group menu"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
              </button>
              {showMenu && (
                <div className="absolute right-0 top-7 z-[60] w-56 rounded-lg border border-border bg-card p-1.5 shadow-xl text-left font-normal normal-case tracking-normal">
                  <GroupMenuItem icon={Pencil} label="Rename group" onClick={() => { closeMenu(); setEditingName(true) }} />
                  <GroupMenuItem icon={Palette} label="Change color" onClick={() => { closeMenu(); setShowColorPicker(true) }} />
                  <GroupMenuItem icon={Info} label="Role & guidance" onClick={() => { closeMenu(); setRoleDraft(group.role_label ?? ''); setGuidanceDraft(group.guidance_note ?? ''); setEditingMeta(true) }} />
                  <GroupMenuItem icon={ListChecks} label="Edit checklist" onClick={() => { closeMenu(); setShowChecklist(true) }} />
                  <GroupMenuItem icon={Copy} label="Duplicate group" onClick={onDuplicateGroup} />
                  {onMoveGroup && !isFirstGroup && <GroupMenuItem icon={ArrowUp} label="Move up" onClick={() => { closeMenu(); onMoveGroup(group.id, 'up') }} />}
                  {onMoveGroup && !isLastGroup && <GroupMenuItem icon={ArrowDown} label="Move down" onClick={() => { closeMenu(); onMoveGroup(group.id, 'down') }} />}
                  <div className="my-1 border-t border-border" />
                  <GroupMenuItem icon={Archive} label="Archive group" onClick={onArchiveGroup} />
                  {confirmDelete ? (
                    <GroupMenuItem icon={Trash2} label="Click to confirm delete" destructive onClick={onDeleteGroup} />
                  ) : (
                    <GroupMenuItem icon={Trash2} label="Delete group" destructive onClick={() => setConfirmDelete(true)} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stage role + Guidance Note editor (Phase 5J). Presentation metadata —
          the role shows as a subtle badge and the note as quiet coaching text on
          the Kanban column header; neither is a checklist item. */}
      {editingMeta && (
        <div className="relative z-30 mx-3 mb-3 ml-5 space-y-2 rounded-lg border border-border bg-surface-1 p-3">
          <div className="flex items-center gap-2">
            <label className="w-20 flex-shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Role</label>
            <input
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value)}
              placeholder="e.g. LO, LP1"
              maxLength={12}
              className="flex-1 rounded border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-jubo-navy focus:outline-none"
            />
          </div>
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Guidance note</label>
            <textarea
              value={guidanceDraft}
              onChange={(e) => setGuidanceDraft(e.target.value)}
              rows={3}
              placeholder="Quiet coaching/context for this stage (not a checklist item)"
              className="mt-1 w-full resize-y rounded border border-border bg-card px-2 py-1 text-xs leading-snug text-foreground focus:border-jubo-navy focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => { setRoleDraft(group.role_label ?? ''); setGuidanceDraft(group.guidance_note ?? ''); setEditingMeta(false) }}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={saveMeta}
              disabled={isPending}
              className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Stage checklist editor (Phase 5K) — add/rename/reorder/remove-from-stage,
          plus a warning-gated delete-everywhere. Progress-safe except delete. */}
      {showChecklist && (
        <StageChecklistModal
          open={showChecklist}
          onClose={() => setShowChecklist(false)}
          boardId={boardId}
          group={{ id: group.id, name: group.name, role_label: group.role_label, guidance_note: group.guidance_note }}
        />
      )}

      {/* Drop zone highlight when dragging over a collapsed group */}
      {isOver && collapsed && (
        <div className="mx-3 mb-3 ml-5 h-10 rounded-lg border-2 border-dashed border-jubo-navy/50 flex items-center justify-center">
          <span className="text-xs text-primary/70">Drop here</span>
        </div>
      )}

      {/* Embedded grid — part of the same surface, divider instead of a frame */}
      {!collapsed && (
        <div className="relative z-10 overflow-x-auto rounded-b-xl border-t border-border/60">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70 bg-surface-1/60">
                <th className="w-7 pl-2 pr-0 py-2.5">
                  {onToggleSelectMany && records.length > 0 && (() => {
                    const allOn = records.every((r) => selectedIds?.has(r.id))
                    const someOn = !allOn && records.some((r) => selectedIds?.has(r.id))
                    return (
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn }}
                        onChange={(e) => onToggleSelectMany(records.map((r) => r.id), e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border bg-surface-1 text-primary focus:ring-ring"
                      />
                    )
                  })()}
                </th>
                <th className="w-6 pl-1 pr-0" />
                <th className="sticky left-0 z-10 bg-surface-1 text-left px-3 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[200px]">Item</th>
                {/* Internal records.status/priority/value are system-level (archive,
                    filtering) and no longer rendered as board columns — only
                    user-created fields show. (Phase 34A.1) */}
                {fields.map(field => {
                  // Phase 37B-2C — the default workflow status column is pinned first
                  // (getBoardFields orders is_default_status first), so it must NOT be
                  // draggable and nothing may be dropped onto it (it can't be displaced
                  // out of its protected slot). Field-column drag uses a DISTINCT id
                  // space ('field-column:') from record drag (dnd-kit 'table-record:').
                  const canReorder = !!onReorderColumn && !field.is_default_status
                  return (
                  <th
                    key={field.id}
                    draggable={canReorder}
                    onDragStart={(e) => { if (!canReorder) return; e.dataTransfer.setData('text/field-id', `field-column:${field.id}`); e.dataTransfer.effectAllowed = 'move' }}
                    onDragOver={(e) => { if (onReorderColumn && !field.is_default_status && e.dataTransfer.types.includes('text/field-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
                    onDrop={(e) => {
                      if (!onReorderColumn || field.is_default_status) return
                      const raw = e.dataTransfer.getData('text/field-id')
                      if (!raw.startsWith('field-column:')) return // ignore non-field drags
                      e.preventDefault()
                      const dragged = raw.slice('field-column:'.length)
                      if (dragged && dragged !== field.id) onReorderColumn(dragged, field.id)
                    }}
                    className={cn('text-left px-3 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground w-36 whitespace-nowrap', canReorder && 'cursor-grab active:cursor-grabbing')}
                  >
                    <EditableColumnHeader
                      field={field}
                      boardId={boardId}
                      groupId={group.id}
                      isCommon={commonFieldIds ? commonFieldIds.has(field.id) : true}
                      usedCommonKeyIds={usedCommonKeyIds}
                    />
                  </th>
                  )
                })}
                <th className="px-2 py-2.5 w-8 text-center">
                  <button onClick={onAddField} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Add field">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={6 + fields.length + 2} className="px-3 py-4 text-center text-xs text-muted-foreground">
                    {isOver ? (
                      <span className="text-primary">Drop here</span>
                    ) : hasActiveFilters ? 'No records match filters' : (
                      <button onClick={onAddRecord} className="hover:text-foreground transition-colors">+ Add first {entityNoun}</button>
                    )}
                  </td>
                </tr>
              ) : (
                records.map(record => (
                  <BoardRecordRow
                    key={record.id}
                    record={record}
                    fields={fields}
                    fieldValueMap={fieldValuesIndex[record.id] ?? {}}
                    groups={groups}
                    boardId={boardId}
                    subitems={subitemsByParent?.[record.id] ?? []}
                    fieldValuesIndex={fieldValuesIndex}
                    isSelected={selectedIds?.has(record.id) ?? false}
                    onToggleSelect={onToggleSelect}
                    onClick={() => onSelectRecord(record.id)}
                    onOpenSubitem={(id) => onSelectRecord(id)}
                    onOptimisticMove={onOptimisticMove}
                    notesSummary={notesByRecord?.[record.id]}
                    onOpenNotes={onOpenNotes}
                  />
                ))
              )}
              {records.length > 0 && (
                <tr className="border-t border-border">
                  <td colSpan={6 + fields.length + 2}>
                    <button onClick={onAddRecord} className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors w-full text-left">
                      <Plus className="w-3 h-3" />Add {entityNoun}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </div>
  )
}

function GroupMenuItem({ icon: Icon, label, onClick, destructive }: {
  icon: React.ElementType; label: string; onClick: () => void; destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-[36px] w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:bg-surface-1',
        destructive ? 'text-destructive' : 'text-foreground',
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', destructive ? 'text-destructive' : 'text-muted-foreground')} />
      {label}
    </button>
  )
}
