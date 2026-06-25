'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, GitBranch, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { seedStageMappings, upsertStageMapping, setStageMappingEnabled, deleteStageMapping } from '../actions'
import type { StageMappingRow } from '../queries'

export function StageMappingClient({
  organizationId, mappings,
}: {
  organizationId: string
  mappings: StageMappingRow[]
}) {
  const [pending, startTransition] = useTransition()
  const [draft, setDraft] = useState({ keyword: '', board_slug: 'active-leads', group_name: '', stage_order: 0 })

  const add = () => {
    if (!draft.keyword.trim() || !draft.group_name.trim()) return
    startTransition(async () => {
      await upsertStageMapping({ organizationId, ...draft, enabled: true })
      setDraft({ keyword: '', board_slug: 'active-leads', group_name: '', stage_order: 0 })
    })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border px-6 py-5">
        <Link href="/settings/integrations" className="mb-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to integrations
        </Link>
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-jubo-navy" />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Status → Stage Mapping</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          How incoming provider statuses move records between board stages. Higher order = more advanced; backward moves are blocked.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {mappings.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-8 text-center">
            <p className="text-sm text-muted-foreground">No custom mappings — the built-in defaults are in effect.</p>
            <Button className="mt-3 gap-1.5" disabled={pending} onClick={() => startTransition(async () => { await seedStageMappings(organizationId) })}>
              <Sparkles className="h-4 w-4" /> Seed default mappings to customize
            </Button>
          </div>
        )}

        {mappings.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-[1.2fr_1fr_1fr_auto_auto_auto] gap-2 border-b border-border bg-surface-1 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Keyword</span><span>Board</span><span>Group</span><span>Order</span><span>On</span><span></span>
            </div>
            <div className="divide-y divide-border">
              {mappings.map((m) => (
                <div key={m.id} className="grid grid-cols-[1.2fr_1fr_1fr_auto_auto_auto] items-center gap-2 px-4 py-2 text-sm">
                  <span className="truncate text-foreground">{m.keyword}</span>
                  <span className="truncate text-muted-foreground">{m.board_slug}</span>
                  <span className="truncate text-muted-foreground">{m.group_name}</span>
                  <span className="text-muted-foreground">{m.stage_order}</span>
                  <button
                    onClick={() => startTransition(async () => { await setStageMappingEnabled(m.id, !m.enabled) })}
                    className={cn('h-4 w-7 rounded-full px-0.5 transition-colors flex items-center', m.enabled ? 'justify-end bg-primary' : 'justify-start bg-surface-3')}>
                    <span className="h-3 w-3 rounded-full bg-white" />
                  </button>
                  <button onClick={() => startTransition(async () => { await deleteStageMapping(m.id) })} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add row */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-foreground">Add mapping</p>
          <div className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_auto_auto]">
            <input placeholder="keyword (e.g. funded)" value={draft.keyword} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
              className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
            <select value={draft.board_slug} onChange={(e) => setDraft({ ...draft, board_slug: e.target.value })}
              className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy">
              <option value="active-leads">active-leads</option>
              <option value="loan-pipeline">loan-pipeline</option>
              <option value="prospecting">prospecting</option>
              <option value="past-clients">past-clients</option>
            </select>
            <input placeholder="group (e.g. Funded)" value={draft.group_name} onChange={(e) => setDraft({ ...draft, group_name: e.target.value })}
              className="rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
            <input type="number" placeholder="order" value={draft.stage_order || ''} onChange={(e) => setDraft({ ...draft, stage_order: Number(e.target.value) })}
              className="w-20 rounded-md border border-border bg-surface-1 px-2.5 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
            <Button className="gap-1.5" disabled={pending} onClick={add}><Plus className="h-4 w-4" /> Add</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
