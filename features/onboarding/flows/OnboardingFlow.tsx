'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Sparkles, Check, Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ONBOARDING_STEPS } from '../questions'
import { useOnboardingWizard } from '../state/OnboardingWizardProvider'
import { ProgressRail } from '../components/ProgressRail'
import { StepShell } from '../components/StepShell'
import { QuestionField } from '../components/QuestionField'
import { ImportCenter } from '../imports/ImportCenter'
import { IntegrationSetup } from '../integrations/IntegrationSetup'
import { completeOnboarding } from '../actions'
import type { ProvisionResult } from '../generators/provision'
import type { IntegrationPreferenceRow } from '../types'

function stepDef(key: string) {
  return ONBOARDING_STEPS.find((s) => s.key === key)!
}

export function OnboardingFlow({
  integrationPrefs,
}: {
  integrationPrefs: IntegrationPreferenceRow[]
}) {
  const wiz = useOnboardingWizard()
  const def = stepDef(wiz.stepKey)

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <ProgressRail />
      <main className="flex-1 overflow-hidden">
        {wiz.stepKey === 'welcome' && <WelcomeStep />}
        {wiz.stepKey === 'generating' && <GeneratingStep />}
        {wiz.stepKey === 'done' && <DoneStep />}
        {['production', 'goals', 'workflow', 'focus'].includes(wiz.stepKey) && (
          <QuestionStep title={def.title} subtitle={def.subtitle} />
        )}
        {wiz.stepKey === 'imports' && (
          <StepShell
            title={def.title}
            subtitle={def.subtitle}
            footer={<NavFooter />}
          >
            <ImportCenter organizationId={wiz.organizationId} />
          </StepShell>
        )}
        {wiz.stepKey === 'integrations' && (
          <StepShell
            title={def.title}
            subtitle={def.subtitle}
            footer={<NavFooter nextLabel="Build my workspace" />}
          >
            <IntegrationSetup organizationId={wiz.organizationId} initial={integrationPrefs} />
          </StepShell>
        )}
      </main>
    </div>
  )
}

// ── Welcome ───────────────────────────────────────────────────────────────────
function WelcomeStep() {
  const { next } = useOnboardingWizard()
  const def = stepDef('welcome')
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-lg text-center animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{def.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">{def.subtitle}</p>
        <div className="mt-8 flex justify-center">
          <Button size="lg" onClick={next} className="gap-2">
            Let’s build it
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-4 text-2xs text-muted-foreground">Takes about 2 minutes · your progress saves automatically</p>
      </div>
    </div>
  )
}

// ── Question steps ──────────────────────────────────────────────────────────
function QuestionStep({ title, subtitle }: { title: string; subtitle: string }) {
  const { stepKey } = useOnboardingWizard()
  const def = stepDef(stepKey)
  return (
    <StepShell title={title} subtitle={subtitle} footer={<NavFooter />}>
      <div className="space-y-4">
        {def.questions?.map((q) => <QuestionField key={String(q.key)} q={q} />)}
      </div>
    </StepShell>
  )
}

// ── Generating (provisioning) ──────────────────────────────────────────────
const BUILD_STAGES = [
  'Creating your boards',
  'Configuring fields',
  'Building dashboards',
  'Generating production goals',
  'Enabling automations',
  'Populating your Today cockpit',
]

function GeneratingStep() {
  const { organizationId, goTo } = useOnboardingWizard()
  const [stage, setStage] = useState(0)
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    // Animate the stage list while provisioning runs.
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1))
    }, 700)

    const run = async () => {
      const started = Date.now()
      let result: ProvisionResult | null = null
      try {
        result = await completeOnboarding(organizationId)
      } catch (err) {
        console.error('[onboarding] provisioning failed:', err)
      }
      if (result) {
        try {
          sessionStorage.setItem(`jubo:onboarding:result:${organizationId}`, JSON.stringify(result))
        } catch { /* ignore */ }
      }
      // Let the animation breathe for a beat before revealing the result.
      const elapsed = Date.now() - started
      const wait = Math.max(0, 2600 - elapsed)
      setTimeout(() => {
        clearInterval(interval)
        setStage(BUILD_STAGES.length)
        goTo('done')
      }, wait)
    }
    void run()

    return () => clearInterval(interval)
  }, [organizationId, goTo])

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Assembling your operating system</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">This only happens once.</p>
        </div>
        <ul className="space-y-2.5">
          {BUILD_STAGES.map((label, i) => {
            const complete = i < stage
            const active = i === stage
            return (
              <li key={label} className="flex items-center gap-3">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    complete
                      ? 'border-primary bg-primary text-primary-foreground'
                      : active
                        ? 'border-primary text-primary'
                        : 'border-border text-transparent'
                  }`}
                >
                  {complete ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                </div>
                <span className={`text-sm ${complete || active ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ── Done ────────────────────────────────────────────────────────────────────
function DoneStep() {
  const { organizationId } = useOnboardingWizard()
  const router = useRouter()
  const [result, setResult] = useState<ProvisionResult | null>(null)

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`jubo:onboarding:result:${organizationId}`)
      if (raw) setResult(JSON.parse(raw))
      localStorage.removeItem(`jubo:onboarding:${organizationId}`)
    } catch { /* ignore */ }
  }, [organizationId])

  const stats = [
    { n: result?.boards ?? 5,    label: 'boards' },
    { n: result?.dashboards ?? 3, label: 'dashboards' },
    { n: result?.widgets ?? 0,    label: 'widgets' },
    { n: result?.workflowsEnabled ?? 0, label: 'automations' },
  ]

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-lg text-center animate-in fade-in slide-in-from-bottom-3 duration-500">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Rocket className="h-7 w-7" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Your operating system is ready</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Everything below was built around how you work. Jump in — your Today cockpit is already populated.
        </p>

        <div className="mt-8 grid grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xl font-semibold text-foreground">{s.n}</p>
              <p className="text-2xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" className="gap-2" onClick={() => router.push('/onboarding/reveal')}>
            See your plan
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => router.push('/dashboard')}>
            Skip to dashboards
          </Button>
        </div>
        <p className="mt-4 text-2xs text-muted-foreground">
          Finish the rest of your setup anytime from the checklist on your dashboard.
        </p>
      </div>
    </div>
  )
}

// ── Shared footer nav ──────────────────────────────────────────────────────
function NavFooter({ nextLabel = 'Continue' }: { nextLabel?: string }) {
  const { back, next, stepIdx, saving } = useOnboardingWizard()
  return (
    <>
      <Button variant="ghost" onClick={back} disabled={stepIdx <= 1} className="gap-1.5">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      <div className="flex items-center gap-3">
        {saving && <span className="text-2xs text-muted-foreground">Saving…</span>}
        <Button onClick={next} className="gap-1.5">
          {nextLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </>
  )
}
