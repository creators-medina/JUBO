'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Plug, Plus, Copy, Check, RefreshCw, Eye, EyeOff, Play, Pause, Trash2,
  CheckCircle2, XCircle, Clock, ChevronDown, Zap, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  createConnection, setConnectionStatus, rotateToken, deleteConnection, simulateEvent, retryEvent, setEventIgnored, runWorkerAction,
} from '../actions'
import { SAMPLE_ARIVE_PAYLOAD } from '../providers/sample'
import type { IntegrationConnectionRow, IntegrationEventRow, ProviderId, ProcessResult } from '../types'

const PROVIDER_LABEL: Record<string, string> = {
  arive_zapier: 'Arive (via Zapier)', custom_webhook: 'Custom Webhook',
}
function pathSegment(provider: string) { return provider.startsWith('arive') ? 'arive' : 'custom' }

export function IntegrationsClient({
  organizationId, connections, events,
}: {
  organizationId: string
  connections: IntegrationConnectionRow[]
  events: IntegrationEventRow[]
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const [pending, startTransition] = useTransition()

  const createArive = (provider: ProviderId, displayName: string) => {
    startTransition(async () => { await createConnection({ organizationId, provider, displayName }) })
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <Plug className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Integrations</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Connect external systems so Jubo stays live with your business.</p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-1.5" disabled={pending} onClick={() => createArive('arive_zapier', 'Arive (via Zapier)')}>
            <Plus className="h-4 w-4" /> Connect Arive
          </Button>
          <Button variant="outline" className="gap-1.5" disabled={pending} onClick={() => createArive('custom_webhook', 'Custom Webhook')}>
            <Plus className="h-4 w-4" /> Custom Webhook
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {connections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-12 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-foreground">No connections yet</p>
            <p className="mt-1 text-xs text-muted-foreground">Connect Arive via Zapier to start syncing loans and borrowers automatically.</p>
          </div>
        ) : (
          <section className="space-y-4">
            {connections.map((c) => (
              <ConnectionCard key={c.id} conn={c} origin={origin} />
            ))}
          </section>
        )}

        <EventLog events={events} organizationId={organizationId} />
      </div>
    </div>
  )
}

function ConnectionCard({ conn, origin }: { conn: IntegrationConnectionRow; origin: string }) {
  const [pending, startTransition] = useTransition()
  const [revealed, setRevealed] = useState(false)
  const [token, setToken] = useState(conn.secret_token)
  const [showTest, setShowTest] = useState(false)

  const webhookUrl = origin ? `${origin}/api/webhooks/integrations/${pathSegment(conn.provider)}?token=${token}` : ''

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{conn.display_name}</h3>
            <StatusPill status={conn.status} />
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {PROVIDER_LABEL[conn.provider] ?? conn.provider} · {conn.event_count} events
            {conn.last_sync_at ? ` · last sync ${new Date(conn.last_sync_at).toLocaleString()}` : ' · no events yet'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowTest((s) => !s)}>
            <Zap className="h-3.5 w-3.5" /> Test
          </Button>
          {conn.status === 'active' ? (
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending}
              onClick={() => startTransition(async () => { await setConnectionStatus(conn.id, 'paused') })}>
              <Pause className="h-3.5 w-3.5" /> Pause
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending}
              onClick={() => startTransition(async () => { await setConnectionStatus(conn.id, 'active') })}>
              <Play className="h-3.5 w-3.5" /> Resume
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" disabled={pending}
            onClick={() => { if (confirm('Delete this connection? The webhook will stop working.')) startTransition(async () => { await deleteConnection(conn.id) }) }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Webhook URL */}
      <div className="mt-4 space-y-1.5">
        <label className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Webhook URL — paste into Zapier</label>
        <CopyRow value={webhookUrl} mono />
      </div>

      {/* Secret token */}
      <div className="mt-3 space-y-1.5">
        <label className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Secret token</label>
        <div className="flex items-center gap-2">
          <CopyRow value={revealed ? token : '•'.repeat(40)} mono copyValue={token} />
          <button onClick={() => setRevealed((r) => !r)} className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground">
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button title="Rotate token" disabled={pending}
            onClick={() => { if (confirm('Rotate token? The old webhook URL will stop working.')) startTransition(async () => { const t = await rotateToken(conn.id); setToken(t); setRevealed(true) }) }}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <p className="mt-3 text-2xs text-muted-foreground">
        In Zapier, add a “Webhooks by Zapier → POST” step to this URL and send your Arive fields as JSON.
      </p>

      {showTest && <TestPanel connectionId={conn.id} onClose={() => setShowTest(false)} />}
    </div>
  )
}

function TestPanel({ connectionId, onClose }: { connectionId: string; onClose: () => void }) {
  const [text, setText] = useState(SAMPLE_ARIVE_PAYLOAD)
  const [result, setResult] = useState<ProcessResult | null>(null)
  const [pending, startTransition] = useTransition()

  const run = () => startTransition(async () => { setResult(await simulateEvent(connectionId, text)) })

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-1 p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-foreground">Simulate a webhook</p>
        <button onClick={onClose} className="text-2xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
        className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" className="gap-1.5" disabled={pending} onClick={run}>
          <Zap className="h-3.5 w-3.5" /> {pending ? 'Sending…' : 'Send test payload'}
        </Button>
        {result && (
          <span className={cn('text-xs', result.ok ? 'text-emerald-400' : 'text-destructive')}>
            {result.ok
              ? result.duplicate ? 'Duplicate — already processed (idempotent)' : `${result.created ? 'Created' : 'Updated'} record${result.matchedOn ? ` · matched on ${result.matchedOn}` : ''}`
              : `Error: ${result.error}`}
          </span>
        )}
      </div>
    </div>
  )
}

function EventLog({ events, organizationId }: { events: IntegrationEventRow[]; organizationId: string }) {
  const [pending, startTransition] = useTransition()
  const pendingCount = events.filter((e) => e.status === 'pending' || e.status === 'retrying' || e.status === 'processing').length

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent events {pendingCount > 0 && <span className="ml-1 text-amber-400">· {pendingCount} pending</span>}
        </h2>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={pending}
          onClick={() => startTransition(async () => { await runWorkerAction(organizationId) })}>
          <RefreshCw className={cn('h-3.5 w-3.5', pending && 'animate-spin')} /> Run worker
        </Button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-8 text-center text-sm text-muted-foreground">
          No events received yet. Send a test payload above or wire up Zapier.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border divide-y divide-border">
          {events.map((e) => <EventRow key={e.id} ev={e} />)}
        </div>
      )}
    </section>
  )
}

const EVENT_STATUS: Record<string, { icon: React.ElementType; cls: string }> = {
  processed:  { icon: CheckCircle2, cls: 'text-emerald-400' },
  received:   { icon: Clock, cls: 'text-blue-400' },
  pending:    { icon: Clock, cls: 'text-amber-400' },
  processing: { icon: RefreshCw, cls: 'text-blue-400' },
  retrying:   { icon: RefreshCw, cls: 'text-amber-400' },
  duplicate:  { icon: Check, cls: 'text-muted-foreground' },
  ignored:    { icon: XCircle, cls: 'text-muted-foreground' },
  failed:     { icon: XCircle, cls: 'text-red-400' },
}

function EventRow({ ev }: { ev: IntegrationEventRow }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const s = EVENT_STATUS[ev.status] ?? EVENT_STATUS.received
  const Icon = s.icon

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className={cn('h-4 w-4 flex-shrink-0', s.cls)} />
        <button onClick={() => setOpen((o) => !o)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate text-sm text-foreground">{ev.event_type ?? 'event'}</span>
          <span className="text-2xs text-muted-foreground">· {ev.provider}</span>
          <ChevronDown className={cn('h-3 w-3 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
        {ev.attempt_count > 0 && <span className="text-2xs text-muted-foreground">×{ev.attempt_count}</span>}
        {ev.processing_duration_ms != null && <span className="text-2xs text-muted-foreground">{ev.processing_duration_ms}ms</span>}
        <span className="text-2xs text-muted-foreground">{new Date(ev.created_at).toLocaleString()}</span>
        {(ev.status === 'failed' || ev.status === 'retrying' || ev.status === 'pending') && (
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending}
            onClick={() => startTransition(async () => { await retryEvent(ev.id) })}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
        {ev.status === 'processed' && (
          <Button size="sm" variant="ghost" className="gap-1.5" disabled={pending}
            onClick={() => startTransition(async () => { await retryEvent(ev.id) })}>
            <RefreshCw className="h-3.5 w-3.5" /> Reprocess
          </Button>
        )}
        {ev.status === 'failed' && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={pending}
            onClick={() => startTransition(async () => { await setEventIgnored(ev.id) })}>
            Ignore
          </Button>
        )}
      </div>

      {ev.error_message && (
        <p className="mt-1.5 flex items-center gap-1.5 pl-7 text-2xs text-destructive">
          <AlertTriangle className="h-3 w-3" /> {ev.error_message}
        </p>
      )}

      {open && (
        <div className="mt-2 grid gap-2 pl-7 lg:grid-cols-2">
          <JsonBlock title="Raw payload" data={ev.payload} />
          <JsonBlock title="Normalized" data={ev.normalized} />
        </div>
      )}
    </div>
  )
}

function JsonBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <p className="border-b border-border bg-surface-1 px-2.5 py-1 text-2xs font-medium text-muted-foreground">{title}</p>
      <pre className="max-h-48 overflow-auto p-2.5 text-2xs text-foreground">{JSON.stringify(data ?? {}, null, 2)}</pre>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-400',
    paused: 'bg-amber-500/15 text-amber-400',
    revoked: 'bg-red-500/15 text-red-400',
  }
  return <span className={cn('rounded px-1.5 py-0.5 text-2xs font-medium capitalize', map[status] ?? 'bg-surface-2 text-muted-foreground')}>{status}</span>
}

function CopyRow({ value, mono, copyValue }: { value: string; mono?: boolean; copyValue?: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(copyValue ?? value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className={cn('w-full rounded-md border border-border bg-surface-1 px-2.5 py-2 text-xs text-foreground focus:outline-none', mono && 'font-mono')} />
      <button onClick={copy} className="flex-shrink-0 rounded-md border border-border p-2 text-muted-foreground hover:text-foreground">
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}
