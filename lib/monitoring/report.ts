// ─────────────────────────────────────────────────────────────────────────
// Error monitoring — dependency-free, Sentry-compatible reporter.
//
// Jubo has no monitoring today. Rather than pull the @sentry/nextjs build
// plugin into this customized Next fork (turbopack/plugin risk), this posts a
// MINIMAL error event to Sentry's ingestion endpoint via raw fetch when a DSN
// is configured — and is completely INERT otherwise, so local/dev never spams.
//
// Configure via OPTIONAL env (set only in deployed envs, not local):
//   SENTRY_DSN             — server/edge exceptions
//   NEXT_PUBLIC_SENTRY_DSN — client exceptions (inlined into the browser bundle)
//
// It never throws and only sends error name/message/stack + a small allowlisted
// context (source, runtime, path, digest). It NEVER sends request bodies,
// headers, cookies, query strings, form data, or any borrower/customer data.
// Swap for the official @sentry/nextjs SDK later if you want replay/tracing.
// ─────────────────────────────────────────────────────────────────────────

type ReportContext = {
  source?: 'server' | 'client' | 'route' | 'global'
  /** Route/path only — never the query string. */
  path?: string
  /** Next.js error digest, if present. */
  digest?: string
  runtime?: string
}

function resolveDsn(): string | undefined {
  if (typeof window !== 'undefined') return process.env.NEXT_PUBLIC_SENTRY_DSN
  return process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
}

/** True when a monitoring DSN is configured for the current runtime. */
export function isMonitoringConfigured(): boolean {
  return !!resolveDsn()
}

function environment(): string {
  return process.env.VERCEL_ENV || process.env.NODE_ENV || 'development'
}

function release(): string | undefined {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA
  return sha ? sha.slice(0, 12) : undefined
}

function eventId(): string {
  try {
    return globalThis.crypto.randomUUID().replace(/-/g, '')
  } catch {
    return `${Date.now().toString(16)}${'0'.repeat(20)}`.slice(0, 32)
  }
}

/**
 * Best-effort error report. Never throws; resolves whether or not it sent.
 * No-op (returns false) when no DSN is configured.
 */
export async function reportError(error: unknown, context: ReportContext = {}): Promise<boolean> {
  const dsn = resolveDsn()
  if (!dsn) return false

  try {
    const u = new URL(dsn)
    const publicKey = u.username
    const projectId = u.pathname.replace(/^\//, '')
    if (!publicKey || !projectId) return false
    const endpoint = `${u.protocol}//${u.host}/api/${projectId}/store/`

    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error')
    const isClient = typeof window !== 'undefined'

    const event = {
      event_id: eventId(),
      timestamp: Date.now() / 1000,
      platform: isClient ? 'javascript' : 'node',
      level: 'error',
      logger: 'jubo',
      environment: environment(),
      ...(release() ? { release: release() } : {}),
      exception: {
        values: [{
          type: err.name || 'Error',
          value: err.message || 'Unknown error',
          ...(err.stack ? { stacktrace: { frames: [], raw: err.stack.split('\n').slice(0, 30).join('\n') } } : {}),
        }],
      },
      tags: {
        source: context.source ?? (isClient ? 'client' : 'server'),
        runtime: context.runtime ?? (isClient ? 'browser' : 'node'),
      },
      extra: {
        ...(context.path ? { path: context.path } : {}),
        ...(context.digest ? { digest: context.digest } : {}),
      },
    }

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_client=jubo/1.0, sentry_key=${publicKey}`,
      },
      body: JSON.stringify(event),
      ...(isClient ? { keepalive: true } : {}),
    })
    return true
  } catch {
    return false
  }
}
