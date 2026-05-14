'use client'

import { useState } from 'react'
import { Plus, Columns3 } from 'lucide-react'
import { PageHeader } from '@/components/primitives/PageHeader'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/ui/button'
import { CreateBoardModal } from './CreateBoardModal'
import { BoardCard } from './BoardCard'

interface Props {
  boards: any[]
  organizationId: string
}

export function BoardsClient({ boards, organizationId }: Props) {
  const [showCreate, setShowCreate] = useState(false)

  return (
    <>
      <PageHeader title="Boards" description="Your dynamic workspace boards">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Board
        </Button>
      </PageHeader>

      {boards.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No boards yet"
          description="Create your first board to start organizing your work."
        >
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create board
          </Button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(board => (
            <BoardCard key={board.id} board={board} />
          ))}
        </div>
      )}

      <CreateBoardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId}
      />
    </>
  )
}
