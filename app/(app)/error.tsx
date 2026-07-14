'use client'

// Friendly error boundary for the authenticated app. Renders inside the app
// shell when a page segment throws — no raw stack traces, a Try again (reset)
// action, and a best-effort report to monitoring (inert without a DSN).

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { reportError } from '@/lib/monitoring/report'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : undefined
    void reportError(error, { source: 'route', digest: error.digest, path })
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">
          <AlertCircle className="h-5 w-5 text-jubo-gold" />
        </div>
        <p className="text-sm font-medium text-foreground">Something went wrong</p>
        <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
          Please refresh, or contact support if this keeps happening.
        </p>
        <button
          onClick={() => reset()}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
