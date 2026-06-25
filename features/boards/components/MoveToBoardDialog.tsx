'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { ArrowRight, X, Loader2, Info } from 'lucide-react'
import { getMoveTargets, moveRecordToBoard, bulkMoveRecordsToBoard, type MoveTargetBoard } from '@/features/records/actions'

const MOVE_ERRORS: Record<string, string> = {
  unauthorized: 'Your session expired. Please sign in again.',
  record_not_found: 'That record no longer exists.',
  forbidden: 'You don’t have access to move this record.',
  board_not_found: 'That board no longer exists.',
  cross_org: 'You can only move within your own workspace.',
  group_not_found: 'That group no longer exists.',
  group_board_mismatch: 'That group doesn’t belong to the chosen board.',
  move_failed: 'Could not move the record.',
}

/**
 * Board → group destination picker for moving one or more records across boards.
 * Boards/groups are loaded live from the DB (never hardcoded). Used by both the
 * single-record (workspace) and bulk (board) move entry points.
 */
export function MoveToBoardDialog({
  recordIds,
  currentBoardId,
  onClose,
  onMoved,
}: {
  recordIds: string[]
  currentBoardId?: string
  onClose: () => void
  onMoved: (result: { moved: number; failed: number }) => void
}) {
  const [targets, setTargets] = useState<MoveTargetBoard[] | null>(null)
  const [boardId, setBoardId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const count = recordIds.length

  useEffect(() => {
    let active = true
    getMoveTargets()
      .then((t) => { if (active) setTargets(t) })
      .catch(() => { if (active) setLoadError(true) })
    return () => { active = false }
  }, [])

  const board = useMemo(() => targets?.find((b) => b.id === boardId) ?? null, [targets, boardId])
  const groups = board?.groups ?? []

  // Reset the group whenever the board changes (dependent-field reset — must be
  // an effect responding to the boardId change, not render-time derivation).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setGroupId('') }, [boardId])

  const submit = () => {
    if (!boardId || !groupId) return
    setMoveError(null)
    startTransition(async () => {
      if (count === 1) {
        const res = await moveRecordToBoard(recordIds[0], boardId, groupId)
        if ('error' in res) { setMoveError(MOVE_ERRORS[res.error] ?? 'Could not move the record.'); return }
        onMoved({ moved: 1, failed: 0 })
      } else {
        const res = await bulkMoveRecordsToBoard(recordIds, boardId, groupId)
        onMoved(res)
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">
            Move {count === 1 ? 'record' : `${count} records`}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {loadError ? (
          <p className="text-xs text-red-300">Couldn’t load boards. Close and try again.</p>
        ) : targets === null ? (
          <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading boards…</div>
        ) : (
          <div className="space-y-3">
            <Field label="Destination board">
              <select value={boardId} onChange={(e) => setBoardId(e.target.value)} className={selectCls}>
                <option value="">Select a board…</option>
                {targets.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}{b.id === currentBoardId ? ' (current)' : ''}</option>
                ))}
              </select>
            </Field>

            <Field label="Destination group">
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={!board} className={selectCls}>
                <option value="">{board ? 'Select a group…' : 'Pick a board first'}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {board && groups.length === 0 && (
                <p className="text-2xs text-amber-300">This board has no groups yet — pick another board.</p>
              )}
            </Field>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2.5">
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <p className="text-2xs text-muted-foreground">
                This record contains board-specific data that will remain preserved but may not be visible on the destination
                board. Notes, tasks, conversations, and history move with the record.
              </p>
            </div>

            {moveError && <p className="text-xs text-red-300">{moveError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-1">Cancel</button>
              <button
                onClick={submit}
                disabled={pending || !boardId || !groupId}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                {count === 1 ? 'Move record' : 'Move records'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const selectCls = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}
