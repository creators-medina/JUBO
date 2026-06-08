// ─────────────────────────────────────────────────────────────────────────
// BusinessPlanOverview — the shared "My Operating System" presentation of a
// producer's reverse-engineered plan. Extracted from PlanRevealClient (Phase
// 33C, Step 1) so the onboarding reveal and the canonical /business-plan page
// render the exact same machine. Pure/presentational — safe in server OR client
// trees (no hooks). The empty state is passed in by the consumer so each
// surface keeps its own copy/CTA.
// ─────────────────────────────────────────────────────────────────────────

import {
  Sparkles, ArrowDown, Target, Users, Phone, TrendingUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PremiumSurface } from '@/components/primitives/PremiumSurface'
import type { PlanSummary } from './PlanExplanationCard'
import type { Forecast } from '../types'

function fmtCurrency(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '$0'
  return `$${Math.round(n).toLocaleString('en-US')}`
}

export function BusinessPlanOverview({
  plan,
  planLeadsTarget,
  weeklyLeads,
  yearlyConversations,
  forecasts,
  goalLabel = 'Your goal',
  machineTitle = "To hit it, here's the plan",
  notesTitle = 'How we got here',
  notesPosition = 'after-machine',
  framedHero = false,
  emptyState = null,
}: {
  plan: PlanSummary | null
  planLeadsTarget: number
  weeklyLeads: number
  yearlyConversations: number
  /** When provided, renders the Current Pace section (from existing forecasts). */
  forecasts?: Forecast[]
  goalLabel?: string
  machineTitle?: string
  notesTitle?: string
  /** Where the "how we got here / why this works" notes render. */
  notesPosition?: 'after-machine' | 'after-focus'
  /** Wrap the income hero in a premium framed surface (Business Plan page). */
  framedHero?: boolean
  /** Rendered in place of the plan when there is no plan yet. */
  emptyState?: React.ReactNode
}) {
  if (!plan) return <>{emptyState}</>

  const incomeInner = (
    <>
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{goalLabel}</p>
      <p className="mt-2 text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
        {fmtCurrency(plan.incomeGoal)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        in income — that&apos;s <span className="text-foreground font-medium">{Math.ceil(plan.closingTarget)}</span> funded loans.
      </p>
    </>
  )

  const notesBlock = plan.notes.length > 0 ? (
    <div className="mt-6 rounded-xl border border-border bg-card p-4">
      <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{notesTitle}</p>
      <ul className="mt-2 space-y-1.5 text-xs text-foreground">
        {plan.notes.map((n, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="mt-1 h-1 w-1 flex-shrink-0 rounded-full bg-muted-foreground" />
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  return (
    <>
      {/* ① Income goal */}
      {framedHero ? (
        <PremiumSurface sweep className="rounded-2xl bg-gradient-to-br from-surface-1 via-card to-surface-1 px-6 py-8 text-center">
          {incomeInner}
        </PremiumSurface>
      ) : (
        <section className="text-center">{incomeInner}</section>
      )}

      {/* ② The machine — reverse-engineered chain */}
      <section className="mt-10">
        <p className="mb-4 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
          {machineTitle}
        </p>
        <div className="space-y-2.5">
          <PlanRow icon={<Target className="h-4 w-4" />} label="Funded loans" value={Math.ceil(plan.closingTarget)} suffix="per year" />
          <Connector />
          <PlanRow icon={<TrendingUp className="h-4 w-4" />} label="Leads" value={planLeadsTarget} suffix="needed" hint={weeklyLeads > 0 ? `~${Math.ceil(weeklyLeads)}/week` : undefined} />
          <Connector />
          <PlanRow icon={<Users className="h-4 w-4" />} label="Referral partners" value={Math.ceil(plan.partnersNeeded)} suffix="committed" />
          <Connector />
          <PlanRow icon={<Phone className="h-4 w-4" />} label="Real conversations" value={Math.ceil(yearlyConversations)} suffix="per year" />
          <Connector />
          <PlanRow icon={<Sparkles className="h-4 w-4" />} label="Talk-tos" value={Math.ceil(plan.weeklyConversations)} suffix="per week" hint={`~${Math.ceil(plan.dailyConversations)}/day`} highlight />
        </div>

        {notesPosition === 'after-machine' && notesBlock}
      </section>

      {/* ③ Current pace — from existing forecast output only */}
      {forecasts && <CurrentPace forecasts={forecasts} />}

      {/* ④ Daily focus */}
      <section className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
        <p className="text-2xs font-semibold uppercase tracking-wide text-primary">Your daily focus</p>
        <p className="mt-2 text-4xl font-semibold tracking-tight text-foreground">
          {Math.ceil(plan.dailyConversations)} <span className="text-base font-normal text-muted-foreground">real conversations</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Aiming for ~{Math.ceil(plan.weeklyConversations)} a week. Voicemails and no-answers don&apos;t count.
        </p>
      </section>

      {/* ⑤ Why this works (notes, when positioned after focus) */}
      {notesPosition === 'after-focus' && notesBlock && (
        <section className="mt-10">{notesBlock}</section>
      )}
    </>
  )
}

// ── Current pace (Step 2) — reads the income forecast; no new math ──────────
function CurrentPace({ forecasts }: { forecasts: Forecast[] }) {
  const f = forecasts.find((x) => x.metric === 'income') ?? forecasts.find((x) => x.metric === 'closings')
  if (!f) return null

  const gap = f.target - f.projected   // positive = behind, negative = ahead
  const status = f.variancePercent >= 5
    ? { label: 'Ahead', tone: 'text-emerald-400', bar: 'bg-emerald-400' }
    : f.onTrack
      ? { label: 'On pace', tone: 'text-emerald-400', bar: 'bg-emerald-400' }
      : { label: 'Behind', tone: 'text-amber-400', bar: 'bg-amber-400' }
  const isCurrency = f.metric === 'income'
  const fmt = (n: number) => isCurrency ? fmtCurrency(n) : Math.round(n).toLocaleString()
  const pct = f.target > 0 ? Math.max(0, Math.min(100, Math.round((f.projected / f.target) * 100))) : 0

  return (
    <section className="mt-10">
      <p className="mb-4 text-center text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Current pace</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <PaceStat label="Projected" value={fmt(f.projected)} />
        <PaceStat label="Goal" value={fmt(f.target)} />
        <PaceStat label={gap > 0 ? 'Gap (behind)' : 'Ahead by'} value={fmt(Math.abs(gap))} tone={gap > 0 ? 'text-amber-400' : 'text-emerald-400'} />
        <PaceStat label="Status" value={status.label} tone={status.tone} />
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-all', status.bar)} style={{ width: `${pct}%` }} />
      </div>
    </section>
  )
}

function PaceStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
      <p className={cn('text-lg font-semibold tabular-nums', tone ?? 'text-foreground')}>{value}</p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ── Sub-components (lifted unchanged from PlanRevealClient) ─────────────────
export function PlanRow({ icon, label, value, suffix, hint, highlight }: {
  icon: React.ReactNode
  label: string
  value: number
  suffix?: string
  hint?: string
  highlight?: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${highlight ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      <div className="flex items-center gap-3">
        <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${highlight ? 'bg-primary/20 text-primary' : 'bg-surface-2 text-muted-foreground'}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{label}</p>
          {hint && <p className="text-2xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="text-right">
        <p className={`text-xl font-semibold ${highlight ? 'text-primary' : 'text-foreground'} tabular-nums`}>
          {value.toLocaleString()}
        </p>
        {suffix && <p className="text-2xs text-muted-foreground">{suffix}</p>}
      </div>
    </div>
  )
}

export function Connector() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="h-3 w-3 text-muted-foreground/50" />
    </div>
  )
}
