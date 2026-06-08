'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles, ArrowRight, Target,
  Columns3, LayoutDashboard, Workflow as WorkflowIcon, Filter,
  CheckCircle2, Upload, Loader2, Trophy, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markPlanRevealed } from '../actions'
import { BusinessPlanOverview } from '@/features/coaching/components/BusinessPlanOverview'
import type { PlanSummary } from '@/features/coaching/components/PlanExplanationCard'

interface RevealData {
  boards: { id: string; name: string; board_type: string | null; icon: string | null; color: string | null; recordCount: number }[]
  dashboards: { id: string; name: string; description: string | null; is_default: boolean | null }[]
  funnelName: string | null
  enabledWorkflows: { title: string; trigger_type: string | null }[]
  integrationsInterested: { provider: string; status: string }[]
  uploadsCount: number
  uploadsNeedingReview: { kind: string; file_name: string }[]
  uploadsFailed: { kind: string; file_name: string }[]
}

interface Props {
  organizationId: string
  isReplay: boolean
  plan: PlanSummary | null
  planLeadsTarget: number
  weeklyLeads: number
  yearlyConversations: number
  baselineAvgCommission: number
  data: RevealData
}

export function PlanRevealClient({
  organizationId, isReplay, plan, planLeadsTarget, weeklyLeads, yearlyConversations, data,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Primary CTA — stamps plan_revealed_at (unless replaying), then opens Today.
  const openOperatingSystem = () => {
    startTransition(async () => {
      try { if (!isReplay) await markPlanRevealed(organizationId) }
      finally { router.push('/today') }
    })
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col px-6 py-10 sm:py-14">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="text-center">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Your Mortgage Operating System Is Ready
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
          Based on your goals, Jubo built a custom business plan for you.
          Here&apos;s exactly what success looks like — and what to do next.
        </p>
      </section>

      {/* ── Sections 1, 2, 4 — the reverse-engineered plan (shared component) ── */}
      <div className="mt-10">
        <BusinessPlanOverview
          plan={plan}
          planLeadsTarget={planLeadsTarget}
          weeklyLeads={weeklyLeads}
          yearlyConversations={yearlyConversations}
          emptyState={
            <section className="rounded-2xl border border-dashed border-border bg-surface-1 p-8 text-center">
              <Target className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">Set your income goal to see your plan</p>
              <p className="mt-1 text-xs text-muted-foreground">Jubo will reverse-engineer it into a daily number to hit.</p>
              <Button className="mt-4 gap-1.5" size="sm" onClick={() => router.push('/goals')}>
                Open Goals <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </section>
          }
        />
      </div>

      {/* ── Needs-review banner — files we held for manual mapping ──────── */}
      {data.uploadsNeedingReview.length > 0 && (
        <section className="mt-8 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-300" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-200">
                {data.uploadsNeedingReview.length} file{data.uploadsNeedingReview.length === 1 ? ' needs' : 's need'} a quick review
              </p>
              <p className="mt-0.5 text-xs text-amber-200/80">
                We couldn&apos;t confidently match every column ({data.uploadsNeedingReview.map((u) => u.file_name).join(', ')}).
                Map the columns yourself in the importer.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => router.push('/imports/new')}>
                <Upload className="h-3.5 w-3.5" /> Review in importer
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Failed-upload banner — surfaced loudly (Phase 30B follow-up fix) ─ */}
      {data.uploadsFailed.length > 0 && (
        <section className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-300" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-200">
                {data.uploadsFailed.length} file{data.uploadsFailed.length === 1 ? '' : 's'} couldn&apos;t be imported
              </p>
              <p className="mt-0.5 text-xs text-red-200/80">
                {data.uploadsFailed.map((u) => u.file_name).join(', ')} — try again from the importer.
              </p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => router.push('/imports/new')}>
                <Upload className="h-3.5 w-3.5" /> Retry in importer
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 3 — What Jubo created (REAL rows for this org) ─────── */}
      <section className="mt-10">
        <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
          What Jubo built for you
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {data.boards.length > 0 && (
            <CreatedCard
              icon={<Columns3 className="h-4 w-4" />}
              title={`${data.boards.length} board${data.boards.length === 1 ? '' : 's'}`}
              items={data.boards.map((b) => b.recordCount > 0 ? `${b.name} · ${b.recordCount.toLocaleString()} record${b.recordCount === 1 ? '' : 's'}` : b.name)}
            />
          )}
          {data.dashboards.length > 0 && (
            <CreatedCard
              icon={<LayoutDashboard className="h-4 w-4" />}
              title={`${data.dashboards.length} dashboard${data.dashboards.length === 1 ? '' : 's'}`}
              items={data.dashboards.map((d) => d.name)}
            />
          )}
          {data.funnelName && (
            <CreatedCard
              icon={<Filter className="h-4 w-4" />}
              title="Production funnel"
              items={[data.funnelName, 'Goal pacing wired in']}
            />
          )}
          {data.enabledWorkflows.length > 0 && (
            <CreatedCard
              icon={<WorkflowIcon className="h-4 w-4" />}
              title={`${data.enabledWorkflows.length} automation${data.enabledWorkflows.length === 1 ? '' : 's'}`}
              items={data.enabledWorkflows.slice(0, 4).map((w) => w.title)}
              extraCount={Math.max(0, data.enabledWorkflows.length - 4)}
            />
          )}
        </div>
        {data.integrationsInterested.length > 0 && (
          <p className="mt-3 text-center text-2xs text-muted-foreground">
            You&apos;re interested in: {data.integrationsInterested.map((p) => p.provider).join(' · ')}
          </p>
        )}
      </section>

      {/* ── Section 5 — Import prompt (only if no uploads yet) ─────────── */}
      {data.uploadsCount === 0 && (
        <section className="mt-10 rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
              <Upload className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground">Next: import your business</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload past clients, referral partners, leads, or your active pipeline.
                The more data Jubo sees, the sharper your plan becomes.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => router.push('/imports/new')}>
                  <Upload className="h-3.5 w-3.5" /> Import my data
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Section 6 — Primary CTA ──────────────────────────────────────── */}
      <section className="mt-10 mb-6 flex flex-col items-center gap-3">
        <Button size="lg" className="gap-2 px-7" onClick={openOperatingSystem} disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Open My Operating System
          <ArrowRight className="h-4 w-4" />
        </Button>
        {isReplay && (
          <p className="text-2xs text-muted-foreground">Replay — your plan is already saved.</p>
        )}
      </section>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function CreatedCard({ icon, title, items, extraCount }: {
  icon: React.ReactNode
  title: string
  items: string[]
  extraCount?: number
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">{icon}</div>
        <p className="text-sm font-medium text-foreground">{title}</p>
      </div>
      <ul className="mt-2 space-y-1 text-2xs text-muted-foreground">
        {items.map((i) => <li key={i} className="truncate">· {i}</li>)}
        {extraCount && extraCount > 0 ? <li className="text-muted-foreground/60">+ {extraCount} more</li> : null}
      </ul>
    </div>
  )
}
