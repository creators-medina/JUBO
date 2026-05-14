'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Settings, ChevronLeft, Search, X, SlidersHorizontal, Columns3 } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CreateGroupModal } from '@/features/board-groups/components/CreateGroupModal'
import { CreateFieldModal } from '@/features/fields/components/CreateFieldModal'
import { CreateRecordModal } from '@/features/records/components/CreateRecordModal'
import { RecordDetailDrawer } from '@/features/records/components/RecordDetailDrawer'
import { BoardGroupTable } from './BoardGroupTable'
import { cn } from '@/lib/utils'
import type { RecordPriority, RecordStatus } from '@/types/database'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  records: any[]
  fieldValues: any[]
  organizationId: string
}

const PRIORITY_OPTIONS: { value: RecordPriority | ''; label: string }[] = [
  { value: '', label: 'All priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
]

const STATUS_OPTIONS: { value: RecordStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'on_hold', label: 'On Hold' },
]

export function BoardDetailClient({ board, groups, fields, records, fieldValues, organizationId }: Props) {
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateField, setShowCreateField] = useState(false)
  const [showCreateRecord, setShowCreateRecord] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecordPriority | ''>('')
  const [filterStatus, setFilterStatus] = useState<RecordStatus | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters = !!(search || filterPriority || filterStatus)

  const clearFilters = () => { setSearch(''); setFilterPriority(''); setFilterStatus('') }

  // Build field values index: record_id -> field_id -> field_value row
  const fieldValuesIndex = useMemo(() => {
    const index: Record<string, Record<string, any>> = {}
    for (const fv of fieldValues) {
      if (!index[fv.record_id]) index[fv.record_id] = {}
      index[fv.record_id][fv.field_id] = fv
    }
    return index
  }, [fieldValues])

  // Filtered records
  const filteredRecords = useMemo(() => {
    let result = records
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(r => r.title.toLowerCase().includes(q))
    }
    if (filterPriority) result = result.filter(r => r.priority === filterPriority)
    if (filterStatus) result = result.filter(r => r.status === filterStatus)
    return result
  }, [records, search, filterPriority, filterStatus])

  const filteredByGroup = useMemo(() =>
    groups.reduce<Record<string, any[]>>((acc, g) => {
      acc[g.id] = filteredRecords.filter(r => r.group_id === g.id)
      return acc
    }, {}),
  [filteredRecords, groups])

  const totalByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = records.filter(r => r.group_id === g.id).length
      return acc
    }, {}),
  [records, groups])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
        <Link href="/boards" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{board.name}</h2>
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground capitalize border border-border">{board.board_type}</span>
          </div>
          {board.description && <p className="text-xs text-muted-foreground mt-0.5">{board.description}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => setShowCreateGroup(true)}>
            <Plus className="w-3 h-3" />Group
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7" title="Settings">
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records…"
            className="pl-8 pr-8 py-1.5 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-52"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          className={cn('h-7 text-xs gap-1.5', (filterPriority || filterStatus) && 'text-primary')}
          onClick={() => setShowFilters(f => !f)}
        >
          <SlidersHorizontal className="w-3 h-3" />
          Filters
          {(filterPriority || filterStatus) && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
        </Button>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            Clear
          </button>
        )}
        {showFilters && (
          <>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value as RecordPriority | '')}
              className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
            >
              {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as RecordStatus | '')}
              className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
            >
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </>
        )}
      </div>

      {/* Table content */}
      <div className="flex-1 overflow-y-auto overflow-x-auto px-4 py-4">
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <EmptyState
              icon={Columns3}
              title="No groups yet"
              description="Groups organize your records into rows of a table. Add your first group to get started."
            >
              <Button size="sm" onClick={() => setShowCreateGroup(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add first group
              </Button>
            </EmptyState>
          </div>
        ) : (
          <div className="min-w-max">
            {groups.map(group => (
              <BoardGroupTable
                key={group.id}
                group={group}
                records={filteredByGroup[group.id] ?? []}
                fields={fields}
                fieldValuesIndex={fieldValuesIndex}
                groups={groups}
                boardId={board.id}
                hasActiveFilters={hasActiveFilters}
                totalCount={totalByGroup[group.id] ?? 0}
                onAddRecord={() => setShowCreateRecord(group.id)}
                onAddField={() => setShowCreateField(true)}
                onSelectRecord={id => setSelectedRecord(id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateGroupModal
        open={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
        boardId={board.id}
        nextPosition={groups.length}
      />
      <CreateFieldModal
        open={showCreateField}
        onClose={() => setShowCreateField(false)}
        boardId={board.id}
        organizationId={organizationId}
        nextPosition={fields.length}
      />
      {showCreateRecord && (
        <CreateRecordModal
          open={true}
          onClose={() => setShowCreateRecord(null)}
          boardId={board.id}
          groupId={showCreateRecord}
          organizationId={organizationId}
          fields={fields}
        />
      )}
      {selectedRecord && (
        <RecordDetailDrawer
          recordId={selectedRecord}
          groups={groups}
          boardId={board.id}
          organizationId={organizationId}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  )
}
