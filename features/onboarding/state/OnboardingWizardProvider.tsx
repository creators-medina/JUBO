'use client'

// ─────────────────────────────────────────────────────────────────────────
// Wizard state — answers, focus weights, current step, and persistence.
//
// Two layers of durability:
//   • localStorage (instant, survives refresh mid-step)
//   • server (saveOnboardingProgress on each step advance — survives device)
// Seeded from the server profile on mount so a returning LO resumes exactly.
// ─────────────────────────────────────────────────────────────────────────

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { saveOnboardingProgress } from '../actions'
import { STEP_ORDER, stepIndex } from '../questions'
import type { OnboardingAnswers, FocusWeights, OnboardingStepKey, OnboardingUploadKind } from '../types'

/** Phase 30B — in-memory hold of uploaded file blobs + their audit-row ids.
 *  The wizard runs the existing import pipeline (parse → autoMap → execute)
 *  against these AFTER provisionWorkspace creates the boards. Cleared on tab
 *  close — we don't persist blobs to storage. */
export type PendingUpload = { file: File; uploadId: string }

type WizardState = {
  organizationId: string
  stepKey: OnboardingStepKey
  stepIdx: number
  totalSteps: number
  answers: OnboardingAnswers
  focusWeights: FocusWeights
  setAnswer: <K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) => void
  setFocusWeight: (area: string, weight: number) => void
  goTo: (key: OnboardingStepKey) => void
  next: () => void
  back: () => void
  saving: boolean
  pendingUploads: Partial<Record<OnboardingUploadKind, PendingUpload>>
  setPendingUpload: (kind: OnboardingUploadKind, payload: PendingUpload) => void
}

const Ctx = createContext<WizardState | null>(null)

export function useOnboardingWizard(): WizardState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useOnboardingWizard must be used inside OnboardingWizardProvider')
  return ctx
}

function lsKey(orgId: string) {
  return `jubo:onboarding:${orgId}`
}

export function OnboardingWizardProvider({
  organizationId,
  initialAnswers,
  initialFocus,
  initialStep,
  children,
}: {
  organizationId: string
  initialAnswers: OnboardingAnswers
  initialFocus: FocusWeights
  initialStep: OnboardingStepKey
  children: React.ReactNode
}) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(initialAnswers)
  const [focusWeights, setFocusWeights] = useState<FocusWeights>(initialFocus)
  const [stepKey, setStepKey] = useState<OnboardingStepKey>(initialStep)
  const [saving, setSaving] = useState(false)
  const [pendingUploads, setPendingUploads] = useState<Partial<Record<OnboardingUploadKind, PendingUpload>>>({})
  const hydrated = useRef(false)

  const setPendingUpload = useCallback((kind: OnboardingUploadKind, payload: PendingUpload) => {
    setPendingUploads((prev) => ({ ...prev, [kind]: payload }))
  }, [])

  // Hydrate from localStorage (overrides server seed only if newer/local edits).
  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    try {
      const raw = localStorage.getItem(lsKey(organizationId))
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.answers) setAnswers((a) => ({ ...a, ...saved.answers }))
        if (saved.focusWeights) setFocusWeights((f) => ({ ...f, ...saved.focusWeights }))
      }
    } catch {
      /* ignore */
    }
  }, [organizationId])

  // Mirror to localStorage on every change.
  useEffect(() => {
    try {
      localStorage.setItem(lsKey(organizationId), JSON.stringify({ answers, focusWeights }))
    } catch {
      /* ignore */
    }
  }, [organizationId, answers, focusWeights])

  const setAnswer = useCallback<WizardState['setAnswer']>((key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }))
  }, [])

  const setFocusWeight = useCallback((area: string, weight: number) => {
    setFocusWeights((f) => ({ ...f, [area]: weight }))
  }, [])

  const persist = useCallback(
    async (next: OnboardingStepKey) => {
      setSaving(true)
      try {
        await saveOnboardingProgress(organizationId, {
          answers,
          focus_weights: focusWeights,
          current_step: next,
        })
      } catch {
        /* non-fatal — localStorage still holds it */
      } finally {
        setSaving(false)
      }
    },
    [organizationId, answers, focusWeights],
  )

  const goTo = useCallback(
    (key: OnboardingStepKey) => {
      setStepKey(key)
      void persist(key)
    },
    [persist],
  )

  const next = useCallback(() => {
    const i = stepIndex(stepKey)
    const n = STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)] as OnboardingStepKey
    goTo(n)
  }, [stepKey, goTo])

  const back = useCallback(() => {
    const i = stepIndex(stepKey)
    const p = STEP_ORDER[Math.max(i - 1, 0)] as OnboardingStepKey
    setStepKey(p)
  }, [stepKey])

  const value: WizardState = {
    organizationId,
    stepKey,
    stepIdx: stepIndex(stepKey),
    totalSteps: STEP_ORDER.length,
    answers,
    focusWeights,
    setAnswer,
    setFocusWeight,
    goTo,
    next,
    back,
    saving,
    pendingUploads,
    setPendingUpload,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
