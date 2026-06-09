'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, AlertTriangle, Columns3, GitBranch, Sunrise } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { executeMondayImport } from '../actions'
import type { MondayParseResult } from '../parsers/mondayXlsx'

type Phase = 'review' | 'run' | 'done'

/**
 * Dedicated Monday.com export flow. Kept separate from the generic importer so
 * the parent/subitem structure is never flattened through the column-mapping
 * pipeline. Reviews the parsed tree, then imports parents + subitems.
 */
export function MondayImportPanel({
  monday,
  organizationId,
  onCancel,
}: {
  monday: MondayParseResult
  organizationId: string
  onCancel: () => void
}) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('review')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ boardId: string; parentsImported: number; subitemsImported: number } | null>(null)

  const hasSubitems = monday.subitemCount > 0

  const run = async () => {
    setError(null)
    setPhase('run')
    try {
      const res = await executeMondayImport({ organizationId, parsed: monday })
      setResult(res)
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import the Monday export.')
      setPhase('review')
    }
  }

  if (phase === 'run') {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm font-medium text-foreground">Importing {monday.parentCount} items + {monday.subitemCount} subitems…</p>
        <p className="mt-1 text-2xs text-muted-foreground">Building the “{monday.boardName}” board</p>
      </div>
    )
  }

  if (phase === 'done' && result) {
    return (
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Check className="h-7 w-7" /></div>
        <h2 className="mt-5 text-2xl font-semibold text-foreground">Monday export imported</h2>
        <p className="mt-1 text-sm text-muted-foreground">Parents and their subitems are in Jubo.</p>
        <div className="mt-6 flex gap-3">
          <Stat label="parent items" value={result.parentsImported} tone="green" />
          <Stat label="subitems" value={result.subitemsImported} tone="green" />
        </div>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button className="gap-1.5" onClick={() => router.push(`/boards/${result.boardId}`)}>
            <Columns3 className="h-4 w-4" /> View board
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => router.push('/today')}>
            <Sunrise className="h-4 w-4" /> Today
          </Button>
        </div>
      </div>
    )
  }

  // review
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-8">
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5">
        <GitBranch className="h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-sm text-foreground"><span className="font-semibold">Monday.com export detected.</span> Jubo will keep your parent items and subitems intact.</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <h2 className="text-lg font-semibold text-foreground">{monday.boardName}</h2>
      <p className="text-sm text-muted-foreground">Review what Jubo detected, then import.</p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Stat label="parent items" value={monday.parentCount} tone="green" />
        <Stat label="subitems" value={monday.subitemCount} tone={hasSubitems ? 'green' : undefined} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Item fields</p>
          <p className="mt-1.5 text-xs text-foreground">{monday.parentHeaders.join(' · ') || '—'}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Subitem fields</p>
          <p className="mt-1.5 text-xs text-foreground">{hasSubitems ? monday.subitemHeaders.join(' · ') : 'No subitems in this file'}</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border bg-surface-1 px-4 py-3 text-xs text-muted-foreground">
        {hasSubitems
          ? 'Subitems will be imported under their parent records. Subitem name, owner, status, and date are preserved where present.'
          : 'No subitem blocks were found — every row imports as a top-level item.'}
      </div>

      {monday.warnings.length > 0 && (
        <ul className="mt-3 space-y-1">
          {monday.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5 text-2xs text-amber-300"><AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" /> {w}</li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
        <Button variant="ghost" onClick={onCancel}>Use a different file</Button>
        <Button className="gap-1.5" disabled={monday.parentCount === 0} onClick={run}>
          Import {monday.parentCount} item{monday.parentCount === 1 ? '' : 's'}{hasSubitems ? ` + ${monday.subitemCount} subitems` : ''}
          <Check className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2">
      <p className={`text-xl font-semibold ${tone === 'green' ? 'text-emerald-400' : 'text-foreground'}`}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}
