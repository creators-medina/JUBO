'use client'

import { cn } from '@/lib/utils'
import { useOnboardingWizard } from '../state/OnboardingWizardProvider'
import type { Question, OnboardingAnswers } from '../types'

const WEIGHT_STEPS = [
  { value: 0, label: 'Skip' },
  { value: 1, label: 'Some' },
  { value: 2, label: 'A lot' },
  { value: 3, label: 'Core' },
]

export function QuestionField({ q }: { q: Question }) {
  const { answers, setAnswer, focusWeights, setFocusWeight } = useOnboardingWizard()

  // Weighted focus-area ranking ----------------------------------------------
  if (q.type === 'weighted' && q.focusAreas) {
    return (
      <div className="space-y-2">
        {q.focusAreas.map((fa) => {
          const current = focusWeights[fa.area] ?? 0
          return (
            <div
              key={fa.area}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface-1 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{fa.label}</p>
                {fa.helper && <p className="text-xs text-muted-foreground truncate">{fa.helper}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {WEIGHT_STEPS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setFocusWeight(fa.area, s.value)}
                    className={cn(
                      'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                      current === s.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-2 text-muted-foreground hover:text-foreground hover:bg-surface-3',
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  const key = q.key as keyof OnboardingAnswers
  const raw = answers[key]

  // Boolean toggle ------------------------------------------------------------
  if (q.type === 'boolean') {
    const on = raw === true
    return (
      <button
        type="button"
        onClick={() => setAnswer(key, (!on) as never)}
        className={cn(
          'flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 text-left transition-colors',
          on ? 'border-jubo-navy/60 bg-jubo-navy/10' : 'border-border bg-surface-1 hover:bg-surface-2',
        )}
      >
        <span className="text-sm font-medium text-foreground">{q.label}</span>
        <span
          className={cn(
            'flex h-5 w-9 items-center rounded-full px-0.5 transition-colors',
            on ? 'justify-end bg-primary' : 'justify-start bg-surface-3',
          )}
        >
          <span className="h-4 w-4 rounded-full bg-white" />
        </span>
      </button>
    )
  }

  // Select --------------------------------------------------------------------
  if (q.type === 'select' && q.options) {
    return (
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">{q.label}</label>
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => {
            const selected = raw === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setAnswer(key, opt.value as never)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                  selected
                    ? 'border-jubo-navy/60 bg-jubo-navy/10 text-foreground'
                    : 'border-border bg-surface-1 text-muted-foreground hover:text-foreground hover:bg-surface-2',
                )}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // Number / currency / text --------------------------------------------------
  const isNumeric = q.type === 'number' || q.type === 'currency'
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {q.label}
        {q.optional && <span className="ml-1.5 text-2xs text-muted-foreground">optional</span>}
      </label>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 focus-within:ring-1 focus-within:ring-primary">
        {q.type === 'currency' && <span className="text-sm text-muted-foreground">$</span>}
        <input
          type={isNumeric ? 'number' : 'text'}
          inputMode={isNumeric ? 'numeric' : 'text'}
          value={raw === undefined || raw === null ? '' : String(raw)}
          placeholder={q.placeholder}
          onChange={(e) => {
            const v = e.target.value
            if (isNumeric) {
              setAnswer(key, (v === '' ? undefined : Number(v)) as never)
            } else {
              setAnswer(key, (v === '' ? undefined : v) as never)
            }
          }}
          className="w-full bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      {q.helper && <p className="text-xs text-muted-foreground">{q.helper}</p>}
    </div>
  )
}
