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
import { runOnboardingImports, type OnboardingImportResult, type ProgressEvent } from '../imports/runOnboardingImports'
import type { ProvisionResult } from '../generators/provision'
import type { IntegrationPreferenceRow, OnboardingUploadKind } from '../types'

const UPLOAD_LABELS: Record<OnboardingUploadKind, string> = {
  past_clients: 'past clients',
  active_leads: 'active leads',
  call_list: 'call list',
  realtors: 'partners',
  loans: 'loan pipeline',
}

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
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-jubo-navy/10 text-jubo-navy">
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
  const { organizationId, goTo, pendingUploads } = useOnboardingWizard()
  const [stage, setStage] = useState(0)
  const [importLines, setImportLines] = useState<Record<string, ProgressEvent>>({})
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    // Animate the build stages while provisioning runs.
    const interval = setInterval(() => {
      setStage((s) => Math.min(s + 1, BUILD_STAGES.length - 1))
    }, 700)

    const run = async () => {
      const started = Date.now()
      let result: ProvisionResult | null = null
      let importResults: OnboardingImportResult[] = []

      try {
        result = await completeOnboarding(organizationId)
      } catch (err) {
        console.error('[onboarding] provisioning failed:', err)
      }

      // Phase 30B — populate the freshly-created boards from the in-memory blobs.
      const blobs = Object.values(pendingUploads).filter(Boolean)
      if (result && blobs.length > 0) {
        try {
          importResults = await runOnboardingImports({
            organizationId,
            createdBoards: result.createdBoards,
            pendingUploads,
            onProgress: (e) => setImportLines((prev) => ({ ...prev, [e.kind]: e })),
          })
        } catch (err) {
          console.error('[onboarding] post-provision imports failed:', err)
        }
      }

      if (result) {
        try {
          sessionStorage.setItem(
            `jubo:onboarding:result:${organizationId}`,
            JSON.stringify({ ...result, imports: importResults }),
          )
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
  }, [organizationId, goTo, pendingUploads])

  const importEntries = Object.entries(importLines) as [OnboardingUploadKind, ProgressEvent][]

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-jubo-navy/10 text-jubo-navy">
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
                      ? 'border-jubo-green bg-jubo-green text-white'
                      : active
                        ? 'border-jubo-navy text-jubo-navy'
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

        {importEntries.length > 0 && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Importing your data</p>
            <ul className="space-y-2">
              {importEntries.map(([kind, evt]) => (
                <li key={kind} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-foreground">
                    {UPLOAD_LABELS[kind]} · <span className="text-muted-foreground">{evt.fileName}</span>
                  </span>
                  <span className={
                    evt.phase === 'done' ? 'text-jubo-green'
                      : evt.phase === 'needs_review' ? 'text-jubo-gold'
                      : evt.phase === 'failed' ? 'text-jubo-red'
                      : 'text-muted-foreground'
                  }>
                    {evt.phase === 'parsing' ? 'Reading…'
                      : evt.phase === 'mapping' ? 'Mapping…'
                      : evt.phase === 'analyzing' ? 'Checking…'
                      : evt.phase === 'importing' ? `${evt.done ?? 0} / ${evt.total ?? 0}`
                      : evt.phase === 'done' ? `${evt.done ?? 0} imported`
                      : evt.phase === 'needs_review' ? 'Needs review'
                      : 'Failed'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Done ────────────────────────────────────────────────────────────────────
function DoneStep() {
  const { organizationId } = useOnboardingWizard()
  const router = useRouter()
  const [result, setResult] = useState<ProvisionResult | null>(null)

  // Hydrate the provision result from browser sessionStorage after mount (and
  // clear the working draft). Browser-only APIs can't run during SSR, so this
  // must remain an effect rather than a lazy initializer.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`jubo:onboarding:result:${organizationId}`)
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-jubo-navy/10 text-jubo-navy">
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
