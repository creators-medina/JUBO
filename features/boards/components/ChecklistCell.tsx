'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckSquare, Square, Loader2 } from 'lucide-react'
import { upsertFieldValue } from '@/features/records/actions'
import { useToast } from '@/features/feedback/ToastProvider'
import { cn } from '@/lib/utils'

interface Props {
  field: { id: string }
  fieldValue: { value_boolean?: boolean | null } | null
  recordId: string
  boardId: string
}

/**
 * Phase 35E.1 — Monday-style checkbox cell for a checklist field. A single click
 * toggles value_boolean (no modal/dropdown). The same field value powers the
 * record's Checklist tab, so both views stay in sync.
 */
export function ChecklistCell({ field, fieldValue, recordId, boardId }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [checked, setChecked] = useState(fieldValue?.value_boolean === true)
  const [pending, startTransition] = useTransition()

  useEffect(() => { setChecked(fieldValue?.value_boolean === true) }, [fieldValue?.value_boolean])

  const toggle = () => {
    const next = !checked
    setChecked(next) // optimistic
    startTransition(async () => {
      try {
        await upsertFieldValue(field.id, recordId, boardId, { value_boolean: next })
        router.refresh()
      } catch (e) {
        setChecked(!next) // rollback
        toast.error(`Couldn't save checklist item — ${e instanceof Error ? e.message : 'please try again'}`)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className={cn('inline-flex items-center justify-center rounded p-0.5 hover:bg-surface-2 transition-colors', pending && 'opacity-60')}
      aria-pressed={checked}
      title={checked ? 'Completed' : 'Not done'}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : checked ? (
        <CheckSquare className="h-4 w-4 text-emerald-400" />
      ) : (
        <Square className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  )
}
