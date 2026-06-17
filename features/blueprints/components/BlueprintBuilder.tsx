'use client'

import { useState, useTransition } from 'react'
import { Loader2, FileJson, CheckCircle2, AlertTriangle, XCircle, Clock, Link2 } from 'lucide-react'
import { previewBlueprint } from '../actions'
import { SAMPLE_BLUEPRINT, type BlueprintPreviewPlan, type PreviewItem } from '../types'
import { cn } from '@/lib/utils'

/**
 * Process Blueprint Builder (Phase 38B) — READ-ONLY. Paste JSON → Validate →
 * dry-run preview plan. No Apply yet (38C). Creates nothing.
 */
export function BlueprintBuilder() {
  const [input, setInput] = useState('')
  const [plan, setPlan] = useState<BlueprintPreviewPlan | null>(null)
  const [pending, startTransition] = useTransition()

  const validate = () => {
    startTransition(async () => {
      const result = await previewBlueprint(input)
      setPlan(result)
    })
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><FileJson className="h-4 w-4 text-primary" /></div>
        <div>
          <h1 className="text-sm font-semibold text-foreground">Process Blueprint Builder</h1>
          <p className="text-2xs text-muted-foreground">Paste a JSON blueprint and preview what it would create. Read-only — nothing is created yet.</p>
        </div>
      </div>

      {/* Input */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-foreground">Blueprint JSON</label>
          <button onClick={() => setInput(SAMPLE_BLUEPRINT)} className="text-2xs text-primary hover:underline">Insert example</button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='{ "version": 1, "boards": [], "automations": [] }'
          spellCheck={false}
          className="h-64 w-full resize-y rounded-lg border border-border bg-surface-1 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={validate}
            disabled={pending || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Validate / Preview
          </button>
          <button
            disabled
            title="Apply coming in 38C"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground opacity-60"
          >
            Apply coming in 38C
          </button>
        </div>
      </div>

      {plan && <PreviewResults plan={plan} />}
    </div>
  )
}

function PreviewResults({ plan }: { plan: BlueprintPreviewPlan }) {
  const s = plan.summary
  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className={cn('flex items-center gap-2 rounded-xl border p-3', plan.valid ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/30 bg-destructive/10')}>
        {plan.valid ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-destructive" />}
        <span className="text-xs font-medium text-foreground">
          {plan.valid ? 'Blueprint is valid — ready to apply once 38C ships.' : `Blueprint has ${s.blockingErrors} blocking error${s.blockingErrors === 1 ? '' : 's'}.`}
        </span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Stat label="Boards" value={s.boards} />
        <Stat label="Groups" value={s.groups} />
        <Stat label="Fields" value={s.fields} />
        <Stat label="Checklist" value={s.checklistFields} />
        <Stat label="Automations" value={s.automationsDeferred} hint="deferred" />
        <Stat label="Warnings" value={s.warnings} />
      </div>

      {plan.blockingErrors.length > 0 && <Section title="Blocking errors" items={plan.blockingErrors} icon={XCircle} tone="error" />}
      {plan.commonFieldBindings.length > 0 && <Section title="Common field bindings" items={plan.commonFieldBindings} icon={Link2} tone="info" />}
      {plan.willCreate.length > 0 && <Section title="Will create" items={plan.willCreate} icon={CheckCircle2} tone="ok" />}
      {plan.warnings.length > 0 && <Section title="Warnings" items={plan.warnings} icon={AlertTriangle} tone="warn" />}
      {plan.unsupportedDeferred.length > 0 && <Section title="Unsupported / deferred" items={plan.unsupportedDeferred} icon={Clock} tone="defer" />}

      <p className="text-2xs text-muted-foreground">apply token: <span className="font-mono">{plan.applyToken}</span> · stable plan generated; Apply (38C) will execute it.</p>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-2xs text-muted-foreground">{label}{hint ? ` (${hint})` : ''}</p>
    </div>
  )
}

const TONES: Record<string, string> = {
  error: 'text-destructive', warn: 'text-amber-400', ok: 'text-emerald-400', info: 'text-primary', defer: 'text-muted-foreground',
}

function Section({ title, items, icon: Icon, tone }: { title: string; items: PreviewItem[]; icon: React.ElementType; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className={cn('h-3.5 w-3.5', TONES[tone])} /> {title} <span className="text-muted-foreground">({items.length})</span>
      </h3>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-2xs">
            <span className={cn('mt-0.5 font-medium uppercase', TONES[tone])}>{it.type}</span>
            <span className="min-w-0 flex-1">
              <span className="text-foreground">{it.message}</span>
              <span className="ml-1 font-mono text-muted-foreground/60">{it.path}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
