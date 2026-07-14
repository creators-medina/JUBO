'use client'

// Root error boundary — catches errors thrown in the root layout/template that
// no nested boundary handled. Must render its own <html>/<body>. Shows a
// friendly message (no stack traces) and reports to monitoring (inert without a
// DSN). Global-error only renders in production builds.

import { useEffect } from 'react'
import { reportError } from '@/lib/monitoring/report'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    void reportError(error, { source: 'global', digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif', background: '#f7f5ef', color: '#1f2937' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 400, width: '100%', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 600, margin: '0 0 6px' }}>Something went wrong</p>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              Please refresh the page, or contact support if this keeps happening.
            </p>
            <button
              onClick={() => reset()}
              style={{ background: '#1e3a5f', color: '#fff', border: 0, borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
