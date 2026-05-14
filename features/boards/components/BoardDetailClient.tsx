'use client'

import { useState } from 'react'
import { Plus, Settings, ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CreateGroupModal } from '@/features/board-groups/components/CreateGroupModal'
import { CreateFieldModal } from '@/features/fields/components/CreateFieldModal'
import { CreateRecordModal } from '@/features/records/components/CreateRecordModal'
import { RecordCard } from '@/features/records/components/RecordCard'
import { RecordDetailDrawer } from '@/features/records/components/RecordDetailDrawer'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  records: any[]
  organizationId: string
}

export function BoardDetailClient({ board, groups, fields, records, organizationId }: Props) {
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateField, setShowCreateField] = useState(false)
  const [showCreateRecord, setShowCreateRecord] = useState<string | null>(null) // group_id
  const [selectedRecord, setSelectedRecord] = useState<string | null>(null)

  const recordsByGroup = groups.reduce<Record<string, any[]>>((acc, group) => {
    acc[group.id] = records.filter(r => r.group_id === group.id)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Board header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/boards" className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">{board.name}</h2>
          {board.description && (
            <p className="text-xs text-muted-foreground">{board.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowCreateField(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Field
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCreateGroup(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Group
          </Button>
          <Button size="icon" variant="ghost" className="w-8 h-8">
            <Settings className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          description="Add groups to organize your records into stages or categories."
        >
          <Button size="sm" onClick={() => setShowCreateGroup(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add group
          </Button>
        </EmptyState>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1 min-h-0">
          {groups.map(group => (
            <div key={group.id} className="flex flex-col w-72 flex-shrink-0">
              {/* Group header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  {group.color && (
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                  )}
                  <span className="text-xs font-semibold text-foreground">{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {(recordsByGroup[group.id] ?? []).length}
                  </span>
                </div>
                <button
                  onClick={() => setShowCreateRecord(group.id)}
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Records */}
              <div className="flex flex-col gap-2 flex-1 overflow-y-auto">
                {(recordsByGroup[group.id] ?? []).map(record => (
                  <RecordCard
                    key={record.id}
                    record={record}
                    groups={groups}
                    boardId={board.id}
                    onClick={() => setSelectedRecord(record.id)}
                  />
                ))}
                <button
                  onClick={() => setShowCreateRecord(group.id)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 transition-colors w-full"
                >
                  <Plus className="w-3 h-3" />
                  Add record
                </button>
              </div>
            </div>
          ))}
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
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  )
}
