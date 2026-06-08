'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Plus, Check, X } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { BoardRecordRow } from './BoardRecordRow'
import { updateBoardGroup } from '@/features/boards/actions'
import { EditableColumnHeader } from './EditableColumnHeader'
import { PremiumSurface } from '@/components/primitives/PremiumSurface'
import { formatVolume } from './BoardStageSummary'
import { cn } from '@/lib/utils'

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#64748b']

interface Props {
  group: any
  records: any[]
  fields: any[]
  fieldValuesIndex: Record<string, Record<string, any>>
  groups: any[]
  boardId: string
  hasActiveFilters: boolean
  totalCount: number
  valueTotal?: number
  emphasized?: boolean
  subitemsByParent?: Record<string, any[]>
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectMany?: (ids: string[], on: boolean) => void
  onAddRecord: () => void
  onAddField: () => void
  onSelectRecord: (id: string) => void
  onOptimisticMove: (recordId: string, toGroupId: string) => void
}

export function BoardGroupTable({
  group,
  records,
  fields,
  fieldValuesIndex,
  groups,
  boardId,
  hasActiveFilters,
  totalCount,
  valueTotal = 0,
  emphasized = false,
  subitemsByParent,
  selectedIds,
  onToggleSelect,
  onToggleSelectMany,
  onAddRecord,
  onAddField,
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

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `group-drop:${group.id}`,
    data: { groupId: group.id },
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

  const avgValue = valueTotal > 0 && totalCount > 0 ? valueTotal / totalCount : 0

  return (
    <div className="mb-5" ref={setDropRef} id={`group-${group.id}`} style={{ scrollMarginTop: 12 }}>
      {/* Group header */}
      <div className={cn(
        'flex items-center gap-2 mb-1 px-1 py-1 rounded-md transition-colors group',
        isOver && 'bg-primary/10'
      )}>
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
            <span className="text-sm font-semibold text-foreground">{group.name}</span>
            <span className="text-xs text-muted-foreground">
              {hasActiveFilters && records.length !== totalCount ? `${records.length} / ${totalCount}` : totalCount}
            </span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-3">
          {valueTotal > 0 && (
            <span className="hidden sm:inline text-2xs text-muted-foreground tabular-nums">
              Volume <span className="font-medium text-foreground">{formatVolume(valueTotal)}</span>
              {avgValue > 0 && <> · Avg <span className="font-medium text-foreground">{formatVolume(avgValue)}</span></>}
            </span>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={onAddRecord} className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors" title="Add record">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Drop zone highlight when dragging over a collapsed group */}
      {isOver && collapsed && (
        <div className="h-10 rounded-md border-2 border-dashed border-primary/50 flex items-center justify-center mb-2">
          <span className="text-xs text-primary/70">Drop here</span>
        </div>
      )}

      {!collapsed && (
        <TablePanel emphasized={emphasized} isOver={isOver}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-1">
                <th className="w-7 pl-2 pr-0 py-2">
                  {onToggleSelectMany && records.length > 0 && (() => {
                    const allOn = records.every((r) => selectedIds?.has(r.id))
                    const someOn = !allOn && records.some((r) => selectedIds?.has(r.id))
                    return (
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={(el) => { if (el) el.indeterminate = someOn }}
                        onChange={(e) => onToggleSelectMany(records.map((r) => r.id), e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border bg-surface-1 text-primary focus:ring-primary"
                      />
                    )
                  })()}
                </th>
                <th className="w-6 pl-1 pr-0" />
                <th className="sticky left-0 z-10 bg-surface-1 text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[200px]">Item</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-24">Priority</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28">Value</th>
                {fields.map(field => (
                  <th key={field.id} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36 whitespace-nowrap">
                    <EditableColumnHeader field={field} />
                  </th>
                ))}
                <th className="px-2 py-2 w-8 text-center">
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
                      <button onClick={onAddRecord} className="hover:text-foreground transition-colors">+ Add first record</button>
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
                    isSelected={selectedIds?.has(record.id) ?? false}
                    onToggleSelect={onToggleSelect}
                    onClick={() => onSelectRecord(record.id)}
                    onOptimisticMove={onOptimisticMove}
                  />
                ))
              )}
              {records.length > 0 && (
                <tr className="border-t border-border">
                  <td colSpan={6 + fields.length + 2}>
                    <button onClick={onAddRecord} className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors w-full text-left">
                      <Plus className="w-3 h-3" />Add record
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TablePanel>
      )}
    </div>
  )
}

// Framed panel for a group's table. The active stage earns the 34D-A premium
// edge; others keep the clean bordered frame. overflow-x-auto stays on the
// inner element (never on .premium-surface) so horizontal scroll + sticky
// columns keep working.
function TablePanel({ emphasized, isOver, children }: { emphasized: boolean; isOver: boolean; children: React.ReactNode }) {
  const inner = (
    <div className={cn(
      'overflow-x-auto rounded-lg',
      !emphasized && (isOver ? 'border border-primary/50 bg-primary/5' : 'border border-border'),
    )}>
      {children}
    </div>
  )
  if (!emphasized) return inner
  // p-px insets the table so the 1px gradient edge stays visible (content is
  // lifted above the decoration layer in .premium-surface).
  return (
    <PremiumSurface className={cn('rounded-lg p-px transition-shadow', isOver && 'ring-1 ring-primary/40')}>
      {inner}
    </PremiumSurface>
  )
}
