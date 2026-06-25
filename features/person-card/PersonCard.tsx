'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, ChevronDown, ChevronRight, CheckSquare, Square, User } from 'lucide-react'
import { getPersonCardData, type PersonCardData, type PersonCardCommon } from './actions'
import { cn } from '@/lib/utils'

/**
 * Person Card V1 (Phase 36D-1) — READ-ONLY cross-board projection of ONE record.
 * Sourced ONLY from getPersonCardData (its own cross-board query), never from the
 * current-board workspace loader. No edit/save/write paths exist here.
 */
export function PersonCard({ recordId }: { recordId: string }) {
  const [data, setData] = useState<PersonCardData | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    // Reset to loading then re-fetch whenever the record changes (data-load
    // effect — the sync reset must precede the async fetch, not derive in render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(undefined)
    getPersonCardData(recordId).then((d) => { if (active) setData(d) }).catch(() => { if (active) setData(null) })
    return () => { active = false }
  }, [recordId])

  if (data === undefined) {
    return <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading card…</div>
  }
  if (data === null) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">Card unavailable for this record.</div>
  }

  const personKeys = data.common.filter((c) => c.scope === 'person')
  const loanKeys = data.common.filter((c) => c.scope === 'loan')
  const otherKeys = data.common.filter((c) => c.scope !== 'person' && c.scope !== 'loan')

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><User className="h-4.5 w-4.5 text-jubo-navy" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">{data.record.title}</h2>
            <p className="text-2xs text-muted-foreground">
              {data.currentBoard?.name ?? 'No board'}{data.currentGroup ? ` · ${data.currentGroup.name}` : ''}
              {data.ownerName ? ` · ${data.ownerName}` : ''}
            </p>
          </div>
        </div>
      </div>

      <Section title="Contact"><CommonGrid items={personKeys} /></Section>
      <Section title="Loan"><CommonGrid items={loanKeys} /></Section>
      {otherKeys.length > 0 && <Section title="Other"><CommonGrid items={otherKeys} /></Section>}

      {/* Checklist (current group only) */}
      {data.checklist.hasChecklist && (
        <Section title={`Checklist · ${data.checklist.completedCount}/${data.checklist.totalCount} (${data.checklist.percentage}%)`}>
          <ul className="space-y-1">
            {data.checklist.items.map((i) => (
              <li key={i.fieldId} className="flex items-center gap-2 text-xs">
                {i.complete ? <CheckSquare className="h-3.5 w-3.5 text-jubo-green" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className={i.complete ? 'text-foreground' : 'text-muted-foreground'}>{i.name}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* This board (board-specific) */}
      {data.thisBoard.length > 0 && (
        <Section title={`This board${data.currentBoard ? ` · ${data.currentBoard.name}` : ''}`}>
          <FieldGrid fields={data.thisBoard} />
        </Section>
      )}

      {/* Previous board data (stranded, grouped by source board) */}
      {data.previousBoards.length > 0 && (
        <Section title="Previous board data">
          <div className="space-y-3">
            {data.previousBoards.map((b) => (
              <div key={b.boardId}>
                <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">From {b.boardName}</p>
                <FieldGrid fields={b.fields} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Tasks */}
      {data.tasks.length > 0 && (
        <Section title="Tasks">
          <ul className="space-y-1">
            {data.tasks.map((t: any) => (
              <li key={t.id} className="flex items-center gap-2 text-xs">
                {t.completed_at ? <CheckSquare className="h-3.5 w-3.5 text-jubo-green" /> : <Square className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className={t.completed_at ? 'text-muted-foreground line-through' : 'text-foreground'}>{t.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Timeline */}
      {data.activities.length > 0 && (
        <Section title="Timeline">
          <ul className="space-y-1.5">
            {data.activities.map((a) => {
              const isCarry = a.activity_type === 'field_change' && a?.metadata?.carry === true
              return (
                <li key={a.id} className={cn('text-2xs', isCarry ? 'text-muted-foreground/70 italic' : 'text-muted-foreground')}>
                  <span className="text-foreground/80">{a.content ?? a.activity_type}</span>
                  <span className="ml-1">· {a.created_at.split('T')[0]}</span>
                </li>
              )
            })}
          </ul>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  )
}

function FieldGrid({ fields }: { fields: { fieldId: string; name: string; value: string }[] }) {
  if (fields.length === 0) return <p className="text-xs text-muted-foreground">—</p>
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {fields.map((f) => (
        <div key={f.fieldId} className="min-w-0">
          <p className="truncate text-2xs text-muted-foreground">{f.name}</p>
          <p className="truncate text-xs text-foreground">{f.value || '—'}</p>
        </div>
      ))}
    </div>
  )
}

function CommonGrid({ items }: { items: PersonCardCommon[] }) {
  if (items.length === 0) return <p className="text-xs text-muted-foreground">No values yet.</p>
  return (
    <div className="space-y-2">
      {items.map((c) => <CommonRow key={c.key} item={c} />)}
    </div>
  )
}

function CommonRow({ item }: { item: PersonCardCommon }) {
  const [open, setOpen] = useState(false)
  const hasConflict = item.conflictCount > 1
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="w-32 flex-shrink-0 text-2xs text-muted-foreground">{item.label}</p>
        <p className="min-w-0 flex-1 truncate text-xs text-foreground">{item.value || '—'}</p>
        {item.sourceBoardName && !hasConflict && (
          <span className="text-[10px] text-muted-foreground/70">{item.sourceBoardName}</span>
        )}
        {hasConflict && (
          <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-jubo-gold hover:bg-surface-1" title="Multiple values across boards">
            <AlertTriangle className="h-3 w-3" />
            {item.conflictCount} values
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>
      {hasConflict && open && (
        <div className="ml-32 mt-1 space-y-0.5 border-l border-border pl-2">
          {item.allValues.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-[11px]">
              <span className="text-foreground">{v.value || '—'}</span>
              <span className="text-muted-foreground/70">· {v.boardName}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
