'use client'

import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  textValue, numberValue, dateValue, rawValue, formatCurrency, formatDate, daysUntil, currentGroupName,
} from '../data'
import type { MortgageData, OpportunitySignal } from '../types'

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Circle
  return <C className={className} />
}

export function SectionCard({ title, icon, children, accent }: { title: string; icon?: string; accent?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon && <Icon name={icon} className={cn('h-4 w-4', accent ?? 'text-muted-foreground')} />}
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      {children}
    </section>
  )
}

function Fact({ label, value, emphasis }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('truncate', emphasis ? 'text-base font-semibold text-foreground' : 'text-sm text-foreground')}>{value ?? '—'}</p>
    </div>
  )
}

// ── Lead ──────────────────────────────────────────────────────────────────
export function LeadOverview({ data }: { data: MortgageData }) {
  return (
    <SectionCard title="Lead Overview" icon="UserPlus" accent="text-blue-400">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Loan Amount" value={formatCurrency(numberValue(data, 'loan_amount'))} emphasis />
        <Fact label="Stage" value={currentGroupName(data)} />
        <Fact label="Lead Source" value={textValue(data, 'lead_source')} />
        <Fact label="Loan Purpose" value={textValue(data, 'loan_purpose')} />
        <Fact label="Email" value={textValue(data, 'email')} />
        <Fact label="Phone" value={textValue(data, 'phone')} />
        <Fact label="Referral Source" value={textValue(data, 'referral_source')} />
        <Fact label="Target Close" value={formatDate(dateValue(data, 'target_close_date'))} />
        <Fact label="Credit" value={textValue(data, 'credit_score_range')} />
      </div>
    </SectionCard>
  )
}

// ── Loan ──────────────────────────────────────────────────────────────────
export function LoanSummary({ data }: { data: MortgageData }) {
  return (
    <SectionCard title="Loan Summary" icon="GitBranch" accent="text-violet-400">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Loan Amount" value={formatCurrency(numberValue(data, 'loan_amount'))} emphasis />
        <Fact label="Loan Type" value={textValue(data, 'loan_type')} />
        <Fact label="Purpose" value={textValue(data, 'loan_purpose')} />
        <Fact label="Est. Closing" value={formatDate(dateValue(data, 'target_close_date'))} />
        <Fact label="Milestone" value={currentGroupName(data)} />
        <Fact label="Preapproval Exp" value={formatDate(dateValue(data, 'preapproval_expiration'))} />
      </div>
    </SectionCard>
  )
}

export function MilestoneTracker({ data }: { data: MortgageData }) {
  const stages = [...data.groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const currentIdx = stages.findIndex((g) => g.id === data.record.group_id)
  if (stages.length === 0) return null
  return (
    <SectionCard title="Milestone Tracker" icon="Milestone" accent="text-violet-400">
      <div className="flex items-center gap-1">
        {stages.map((g, i) => {
          const done = currentIdx >= 0 && i < currentIdx
          const active = i === currentIdx
          return (
            <div key={g.id} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full items-center">
                <div className={cn('h-1 flex-1 rounded-full', i === 0 ? 'opacity-0' : done || active ? 'bg-primary' : 'bg-surface-2')} />
                <div className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', done ? 'bg-primary' : active ? 'bg-primary ring-2 ring-primary/30' : 'bg-surface-3')} />
                <div className={cn('h-1 flex-1 rounded-full', i === stages.length - 1 ? 'opacity-0' : done ? 'bg-primary' : 'bg-surface-2')} />
              </div>
              <span className={cn('text-center text-2xs', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{g.name}</span>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ── Partner ─────────────────────────────────────────────────────────────────
export function RelationshipSummary({ data }: { data: MortgageData }) {
  const refs = numberValue(data, 'referrals_ytd')
  return (
    <SectionCard title="Relationship" icon="Handshake" accent="text-teal-400">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Referrals YTD" value={refs ?? 0} emphasis />
        <Fact label="Company" value={textValue(data, 'brokerage_company')} />
        <Fact label="Stage" value={currentGroupName(data)} />
        <Fact label="Email" value={textValue(data, 'email')} />
        <Fact label="Phone" value={textValue(data, 'phone')} />
      </div>
    </SectionCard>
  )
}

// ── Past client ───────────────────────────────────────────────────────────
export function PastClientOverview({ data }: { data: MortgageData }) {
  const closed = dateValue(data, 'closed_date')
  // Next anniversary countdown.
  let anniversary = '—'
  if (closed) {
    const c = new Date(closed)
    const now = new Date()
    const next = new Date(now.getFullYear(), c.getMonth(), c.getDate())
    if (next < now) next.setFullYear(now.getFullYear() + 1)
    const d = daysUntil(next.toISOString())
    anniversary = d != null ? `in ${d}d` : '—'
  }
  return (
    <SectionCard title="Relationship Overview" icon="Heart" accent="text-rose-400">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Fact label="Closed" value={formatDate(closed)} />
        <Fact label="Loan Anniversary" value={anniversary} />
        <Fact label="Current Rate" value={numberValue(data, 'current_rate') != null ? `${numberValue(data, 'current_rate')}%` : '—'} />
        <Fact label="Loan Amount" value={formatCurrency(numberValue(data, 'loan_amount'))} />
        <Fact label="Refi Opportunity" value={rawValue(data, 'refi_opportunity') ? 'Yes' : '—'} />
      </div>
    </SectionCard>
  )
}

// ── Key facts (generic fallback / supplement) ────────────────────────────────
export function KeyFacts({ data }: { data: MortgageData }) {
  const rows = data.fields
    .map((f) => {
      const fv = data.fieldValues.find((v) => v.field_id === f.id)
      const value = fv ? (fv.value_text ?? fv.value_number ?? fv.value_date ?? (fv.value_json as unknown) ?? fv.value_boolean) : null
      return { name: f.name, value }
    })
    .filter((r) => r.value != null && r.value !== '')
  if (rows.length === 0) {
    return <SectionCard title="Details" icon="Info"><p className="text-xs text-muted-foreground">No field values yet.</p></SectionCard>
  }
  return (
    <SectionCard title="Details" icon="Info">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {rows.map((r) => <Fact key={r.name} label={r.name} value={String(r.value)} />)}
      </div>
    </SectionCard>
  )
}

// ── Opportunity signals ──────────────────────────────────────────────────────
const SIGNAL_STYLE: Record<OpportunitySignal['level'], string> = {
  urgent: 'border-red-500/30 bg-red-500/10 text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  positive: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  info: 'border-border bg-surface-1 text-foreground',
}
const SIGNAL_ICON_COLOR: Record<OpportunitySignal['level'], string> = {
  urgent: 'text-red-400', warning: 'text-amber-400', positive: 'text-emerald-400', info: 'text-muted-foreground',
}

export function OpportunitySignals({ signals }: { signals: OpportunitySignal[] }) {
  if (signals.length === 0) {
    return (
      <SectionCard title="Opportunity Signals" icon="Sparkles">
        <p className="text-xs text-muted-foreground">Nothing needs attention right now.</p>
      </SectionCard>
    )
  }
  return (
    <SectionCard title="Opportunity Signals" icon="Sparkles">
      <div className="space-y-2">
        {signals.map((s) => (
          <div key={s.key} className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', SIGNAL_STYLE[s.level])}>
            <Icon name={s.icon} className={cn('h-4 w-4 flex-shrink-0', SIGNAL_ICON_COLOR[s.level])} />
            <span className="text-sm font-medium text-foreground">{s.label}</span>
            {s.detail && <span className="ml-auto text-2xs text-muted-foreground">{s.detail}</span>}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ── Pipeline history (movement timeline, compact) ────────────────────────────
export function PipelineHistory({ data }: { data: MortgageData }) {
  const moves = data.movements
  if (!moves || moves.length === 0) {
    return <SectionCard title="Pipeline History" icon="GitCommitHorizontal"><p className="text-xs text-muted-foreground">No stage changes yet.</p></SectionCard>
  }
  return (
    <SectionCard title="Pipeline History" icon="GitCommitHorizontal">
      <div className="space-y-2">
        {moves.slice(0, 8).map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="text-foreground">{m.from_group?.name ?? '—'} → {m.to_group?.name ?? '—'}</span>
            <span className="ml-auto text-2xs text-muted-foreground">{formatDate(m.created_at)}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
