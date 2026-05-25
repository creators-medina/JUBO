'use client'

import { Check, Command } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ONBOARDING_STEPS } from '../questions'
import { useOnboardingWizard } from '../state/OnboardingWizardProvider'

// Steps shown on the rail (skip the terminal build/done steps — they're not
// navigable milestones).
const RAIL_STEPS = ONBOARDING_STEPS.filter((s) => s.key !== 'generating' && s.key !== 'done')

export function ProgressRail() {
  const { stepIdx, stepKey } = useOnboardingWizard()

  return (
    <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-border bg-surface-1/40 p-6 lg:flex">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
          <Command className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground">Jubo setup</span>
      </div>

      <nav className="space-y-1">
        {RAIL_STEPS.map((s, i) => {
          const done = i < stepIdx
          const active = s.key === stepKey
          return (
            <div key={s.key} className="flex items-center gap-3 py-1.5">
              <div
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-2xs font-semibold transition-colors',
                  done && 'border-primary bg-primary text-primary-foreground',
                  active && !done && 'border-primary bg-primary/10 text-primary',
                  !active && !done && 'border-border bg-surface-2 text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-sm transition-colors',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.railLabel}
              </span>
            </div>
          )
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border bg-surface-1 p-3">
        <p className="text-xs font-medium text-foreground">Your progress is saved</p>
        <p className="mt-1 text-2xs text-muted-foreground">
          Close anytime — you’ll pick up right where you left off.
        </p>
      </div>
    </aside>
  )
}
