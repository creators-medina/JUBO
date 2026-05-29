'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, Users, Sparkles, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EmptyState } from '@/components/primitives/EmptyState'
import { updateFeedbackStatus } from './actions'
import type { AnalyticsSummary, FeedbackRow } from './queries'

const STATUSES = ['new', 'acknowledged', 'in_progress', 'resolved', 'wontfix']
const TYPE_COLOR: Record<string, string> = { bug: 'text-red-400', feature: 'text-violet-400', general: 'text-muted-foreground' }

export function AnalyticsSettingsClient({ summary, feedback }: { summary: AnalyticsSummary; feedback: FeedbackRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const setStatus = (id: string, status: string) => startTransition(async () => {
    await updateFeedbackStatus(id, status); router.refresh()
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10"><BarChart3 className="h-4.5 w-4.5 text-primary" /></div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Product analytics</h1>
          <p className="text-xs text-muted-foreground">Lightweight usage signals (last 30 days) + team feedback. Admin-only.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Users} label="Active (7d)" value={summary.activeUsers7d} />
        <Stat icon={Users} label="Active (30d)" value={summary.activeUsers30d} />
        <Stat icon={Sparkles} label="Onboarded" value={summary.onboardingCompletions} />
        <Stat icon={MessageSquare} label="Events (30d)" value={summary.totalEvents} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel title="Most-used events">
          {summary.byEvent.length === 0 ? <Muted>No events yet.</Muted> : (
            <div className="space-y-1.5">{summary.byEvent.slice(0, 8).map((e) => <Bar key={e.event} label={e.event} value={e.count} max={summary.byEvent[0].count} />)}</div>
          )}
        </Panel>
        <Panel title="Surface usage (page views)">
          {summary.bySurface.length === 0 ? <Muted>No page views yet.</Muted> : (
            <div className="space-y-1.5">{summary.bySurface.map((s) => <Bar key={s.surface} label={s.surface} value={s.count} max={summary.bySurface[0].count} />)}</div>
          )}
        </Panel>
      </div>

      <Panel title={`Feedback (${feedback.length})`}>
        {feedback.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No feedback yet" description="Bug reports and feature requests from your team will show up here." />
        ) : (
          <div className="divide-y divide-border">
            {feedback.map((f) => (
              <div key={f.id} className="flex items-start gap-3 py-2.5">
                <span className={cn('mt-0.5 text-2xs font-semibold uppercase', TYPE_COLOR[f.feedback_type] ?? 'text-muted-foreground')}>{f.feedback_type}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{f.title}</p>
                  {f.description && <p className="mt-0.5 text-xs text-muted-foreground">{f.description}</p>}
                </div>
                <select value={f.status} disabled={pending} onChange={(e) => setStatus(f.id, e.target.value)}
                  className="flex-shrink-0 rounded-md border border-border bg-surface-1 px-2 py-1 text-2xs text-foreground focus:outline-none">
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><span className="text-2xs uppercase tracking-wider">{label}</span></div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </div>
  )
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-40 flex-shrink-0 truncate text-xs text-foreground">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
      <span className="w-8 flex-shrink-0 text-right text-2xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  )
}
function Muted({ children }: { children: React.ReactNode }) { return <p className="text-xs text-muted-foreground">{children}</p> }
