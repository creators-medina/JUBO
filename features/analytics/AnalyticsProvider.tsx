'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { FeedbackModal } from './FeedbackModal'

type AnalyticsUi = { openFeedback: (type?: string) => void }
const Ctx = createContext<AnalyticsUi | null>(null)

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState('general')
  const openFeedback = useCallback((t = 'general') => { setType(t); setOpen(true) }, [])

  return (
    <Ctx.Provider value={{ openFeedback }}>
      {children}
      {open && <FeedbackModal initialType={type} onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  )
}

export function useAnalyticsUi(): AnalyticsUi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAnalyticsUi must be used inside AnalyticsProvider')
  return c
}
