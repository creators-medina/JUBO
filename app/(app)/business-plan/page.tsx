import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Pencil, Target, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCoachingSnapshot } from '@/features/coaching/queries'
import { BusinessPlanOverview } from '@/features/coaching/components/BusinessPlanOverview'
import type { PlanSummary } from '@/features/coaching/components/PlanExplanationCard'

export const dynamic = 'force-dynamic'

export default async function BusinessPlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  const orgId = membership.organization_id

  // Same data flow as Today / the reveal — never call reverseEngineerPlan directly.
  const snap = await getCoachingSnapshot(orgId, user.id)

  const plan: PlanSummary | null = snap.plan
    ? {
        incomeGoal: snap.plan.incomeGoal,
        dailyConversations: snap.plan.dailyConversations,
        weeklyConversations: snap.plan.weeklyConversations,
        partnersNeeded: snap.plan.partnersNeeded,
        closingTarget: snap.plan.closingTarget,
        notes: snap.plan.notes,
        executionScore: snap.execution.overall,
        talkTosToday: snap.talkTosToday,
      }
    : null

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          {/* IA consolidation: this page is coaching over the goals engine; the
              canonical planning-math page is /production-plan (see banner). */}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Coaching</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your income goal, reverse-engineered into a daily number.</p>
        </div>
        <Link
          href="/goals"
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit plan
        </Link>
      </header>

      {/* Pointer to the canonical planning page — non-invasive, no behavior
          or calculation changes here. */}
      <div className="mb-6 rounded-xl border border-jubo-gold/30 bg-jubo-gold-soft/40 px-4 py-3 text-sm text-foreground">
        Looking for planning math? Use{' '}
        <Link href="/production-plan" className="font-semibold text-jubo-navy underline-offset-2 hover:underline">
          Production Plan
        </Link>{' '}
        for income goals, lead-source mix, and activity targets. Business Coaching remains here for execution insights and coaching notes.
      </div>

      <BusinessPlanOverview
        plan={plan}
        planLeadsTarget={snap.plan ? Math.ceil(snap.plan.leadsTarget) : 0}
        weeklyLeads={snap.plan ? snap.plan.weeklyLeads : 0}
        yearlyConversations={snap.plan ? snap.plan.yearlyConversations : 0}
        forecasts={snap.forecasts}
        goalLabel="Income goal"
        machineTitle="The machine — what your income requires"
        notesTitle="Why this works"
        notesPosition="after-focus"
        framedHero
        emptyState={
          <section className="rounded-2xl border border-dashed border-border bg-surface-1 p-10 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-jubo-navy/10 text-jubo-navy">
              <Target className="h-6 w-6" />
            </div>
            <p className="text-lg font-semibold text-foreground">Let&apos;s build your business plan.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Set your income goal and Jubo reverse-engineers it into funded loans, leads, partners, and the
              conversations you need each day.
            </p>
            <Link
              href="/goals"
              className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Go to Goals <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        }
      />
    </div>
  )
}
