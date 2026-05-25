'use client'

import { useState } from 'react'
import * as Icons from 'lucide-react'
import { cn } from '@/lib/utils'
import { INTEGRATION_CATALOG } from '../templates/integrations'
import { setIntegrationPreference } from '../actions'
import type { IntegrationProvider, IntegrationStatus, IntegrationPreferenceRow } from '../types'

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Plug
  return <C className={className} />
}

export function IntegrationSetup({
  organizationId,
  initial,
}: {
  organizationId: string
  initial?: IntegrationPreferenceRow[]
}) {
  const seed: Record<string, IntegrationStatus> = {}
  for (const p of initial ?? []) seed[p.provider] = p.status
  const [prefs, setPrefs] = useState<Record<string, IntegrationStatus>>(seed)
  const [busy, setBusy] = useState<string | null>(null)

  const choose = async (provider: IntegrationProvider, status: IntegrationStatus) => {
    setBusy(provider)
    setPrefs((p) => ({ ...p, [provider]: status }))
    try {
      await setIntegrationPreference(organizationId, provider, status)
    } catch {
      /* optimistic; ignore */
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {INTEGRATION_CATALOG.map((it) => {
        const status = prefs[it.provider]
        return (
          <div key={it.provider} className="rounded-lg border border-border bg-surface-1 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-foreground">
                  <Icon name={it.icon} className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{it.name}</p>
                    {!it.available && (
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-2xs text-muted-foreground">Soon</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{it.tagline}</p>
                  <p className="mt-1.5 text-2xs text-muted-foreground">{it.connectionModel}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={busy === it.provider}
                onClick={() => choose(it.provider, 'interested')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  status === 'interested'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-2 text-foreground hover:bg-surface-3',
                )}
              >
                I want this
              </button>
              <button
                type="button"
                disabled={busy === it.provider}
                onClick={() => choose(it.provider, 'connect_later')}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
                  status === 'connect_later'
                    ? 'border border-border bg-surface-2 text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Connect later
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
