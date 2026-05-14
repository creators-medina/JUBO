'use client'

import { useState, useMemo } from 'react'
import { Plus, Settings, ChevronLeft, Search, X, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CreateGroupModal } from '@/features/board-groups/components/CreateGroupModal'
import { CreateFieldModal } from '@/features/fields/components/CreateFieldModal'
import { CreateRecordModal } from '@/features/records/components/CreateRecordModal'
import { RecordCard } from '@/features/records/components/RecordCard'
import { RecordDetailDrawer } from '@/features/records/components/RecordDetailDrawer'
import { cn } from '@/lib/utils'
import type { RecordPriority, RecordStatus } from '@/types/database'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  records: any[]
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

export function BoardDetailClient({ board, groups, fields, records, organizationId }: Props) {
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateField, setShowCreateField] = useState(false)
  const [showCreateRecord, setShowCreateRecord] = useState<string | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecordPriority | ''>('')
  const [filterStatus, setFilterStatus] = useState<RecordStatus | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters = search || filterPriority || filterStatus

  const clearFilters = () => {
    setSearch('')
    setFilterPriority('')
    setFilterStatus('')
  }

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

  const recordsByGroup = useMemo(() =>
    groups.reduce<Record<string, any[]>>((acc, g) => {
      acc[g.id] = filteredRecords.filter(r => r.group_id === g.id)
      return acc
    }, {}),
  [filteredRecords, groups])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Board header */}
      <div className="flex items-center gap-3 mb-3">
        <Link href="/boards" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">{board.name}</h2>
          {board.description && <p className="text-xs text-muted-foreground">{board.description}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowCreateField(true)}>
            <Plus className="w-3 h-3 mr-1" />Field
          </Button>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => setShowCreateGroup(true)}>
            <Plus className="w-3 h-3 mr-1" />Group
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7">
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search records…"
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
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
          <button
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      {showFilters && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value as RecordPriority | '')}
            className="px-2.5 py-1 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
          >
            {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as RecordStatus | '')}
            className="px-2.5 py-1 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      )}

      {/* Empty board state */}
      {groups.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="No groups yet"
            description="Groups organize your records into stages or categories. Add your first group to get started."
          >
            <Button size="sm" onClick={() => setShowCreateGroup(true)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Add first group
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 flex-1 min-h-0 items-start">
          {groups.map(group => {
            const groupRecords = recordsByGroup[group.id] ?? []
            const totalCount = records.filter(r => r.group_id === group.id).length
            const filteredCount = groupRecords.length
            const isFiltered = !!hasActiveFilters && filteredCount !== totalCount

            return (
              <div key={group.id} className="flex flex-col w-68 flex-shrink-0 min-w-[260px] max-w-[280px]">
                {/* Group header */}
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {group.color && (
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    )}
                    <span className="text-xs font-semibold text-foreground truncate">{group.name}</span>
                    <span className="text-2xs text-muted-foreground flex-shrink-0">
                      {isFiltered ? `${filteredCount}/${totalCount}` : totalCount}
                    </span>
                  </div>
                  <button
                    onClick={() => setShowCreateRecord(group.id)}
                    className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex-shrink-0"
                    title="Add record"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Records */}
                <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-240px)]">
                  {groupRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 px-3 rounded-lg border border-dashed border-border">
                      {hasActiveFilters ? (
                        <p className="text-2xs text-muted-foreground text-center">No records match filters</p>
                      ) : (
                        <button
                          onClick={() => setShowCreateRecord(group.id)}
                          className="text-2xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          + Add record
                        </button>
                      )}
                    </div>
                  ) : (
                    groupRecords.map(record => (
                      <RecordCard
                        key={record.id}
                        record={record}
                        groups={groups}
                        boardId={board.id}
                        onClick={() => setSelectedRecord(record.id)}
                      />
                    ))
                  )}
                  {groupRecords.length > 0 && !hasActiveFilters && (
                    <button
                      onClick={() => setShowCreateRecord(group.id)}
                      className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors w-full"
                    >
                      <Plus className="w-3 h-3" />
                      Add record
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

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
