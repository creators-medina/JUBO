import Link from 'next/link'
import { Sparkles, ArrowRight, Target } from 'lucide-react'
import { HelpTip } from '@/components/primitives/HelpTip'

export type PlanSummary = {
  incomeGoal: number
  dailyConversations: number
  weeklyConversations: number
  partnersNeeded: number
  closingTarget: number
  notes: string[]
  executionScore: number
  talkTosToday: number
}

/**
 * The "Jubo understands my business" surface: shows how the income goal becomes
 * a daily number, and exactly what to focus on today.
 */
export function PlanExplanationCard({ plan }: { plan: PlanSummary | null }) {
  if (!plan) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-surface-1 p-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your plan</h2>
        </div>
        <p className="mt-2 text-sm text-foreground">Set an income goal and Jubo will reverse-engineer it into a daily number to hit.</p>
        <Link href="/goals" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Set your goal <ArrowRight className="h-3 w-3" />
        </Link>
      </section>
    )
  }

  const daily = Math.ceil(plan.dailyConversations)
  const remaining = Math.max(0, daily - plan.talkTosToday)
  const pct = Math.min(100, Math.round((plan.talkTosToday / Math.max(1, daily)) * 100))

  return (
    <section className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your plan, reverse-engineered</h2>
        <HelpTip text="Jubo works backward from your income goal — closings, leads, partners — to the daily number of real conversations that gets you there. Adjust assumptions in Settings." />
      </div>

      <p className="text-lg font-semibold text-foreground">
        Focus today:{' '}
        <span className="text-primary">{remaining > 0 ? `${remaining} more conversation${remaining === 1 ? '' : 's'}` : 'daily target hit'}</span>
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {plan.talkTosToday} of {daily} talk-tos today · aiming for {Math.round(plan.weeklyConversations)}/week
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {plan.notes.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-border pt-2.5">
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">How we got there</p>
          {plan.notes.slice(0, 3).map((n, i) => (
            <p key={i} className="text-2xs text-muted-foreground">· {n}</p>
          ))}
        </div>
      )}
    </section>
  )
}
