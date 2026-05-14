'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import { BoardRecordRow } from './BoardRecordRow'
import { cn } from '@/lib/utils'

interface Props {
  group: any
  records: any[]
  fields: any[]
  // Map: record_id -> { field_id -> field_value_row }
  fieldValuesIndex: Record<string, Record<string, any>>
  groups: any[]
  boardId: string
  hasActiveFilters: boolean
  totalCount: number
  onAddRecord: () => void
  onAddField: () => void
  onSelectRecord: (id: string) => void
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
  onAddRecord,
  onAddField,
  onSelectRecord,
}: Props) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="mb-6">
      {/* Group header */}
      <div className="flex items-center gap-2 mb-1 px-1 group">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 group/header"
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover/header:text-foreground transition-colors" />
            : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground group-hover/header:text-foreground transition-colors" />
          }
          <div className="flex items-center gap-2">
            {group.color && (
              <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: group.color }} />
            )}
            <span className="text-sm font-semibold text-foreground">{group.name}</span>
            <span className="text-xs text-muted-foreground">
              {hasActiveFilters && records.length !== totalCount
                ? `${records.length} / ${totalCount}`
                : records.length}
            </span>
          </div>
        </button>
        <button
          onClick={onAddRecord}
          className="ml-2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors opacity-0 group-hover:opacity-100"
          title="Add record"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b border-border bg-surface-1">
                <th className="sticky left-0 z-10 bg-surface-1 text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[220px]">
                  Item
                </th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28">Status</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-24">Priority</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-28">Value</th>
                {fields.map(field => (
                  <th key={field.id} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground w-36 whitespace-nowrap">
                    {field.name}
                  </th>
                ))}
                {/* Add field column */}
                <th className="px-2 py-2 w-8 text-center">
                  <button
                    onClick={onAddField}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                    title="Add field"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={4 + fields.length + 1}
                    className="px-3 py-4 text-center text-xs text-muted-foreground"
                  >
                    {hasActiveFilters ? 'No records match filters' : (
                      <button onClick={onAddRecord} className="hover:text-foreground transition-colors">
                        + Add first record
                      </button>
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
                    onClick={() => onSelectRecord(record.id)}
                  />
                ))
              )}
              {/* Add record row */}
              {records.length > 0 && (
                <tr className="border-t border-border">
                  <td colSpan={4 + fields.length + 1}>
                    <button
                      onClick={onAddRecord}
                      className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors w-full text-left"
                    >
                      <Plus className="w-3 h-3" />
                      Add record
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
