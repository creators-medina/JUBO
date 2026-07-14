// Next.js instrumentation — server/edge error capture. `onRequestError` fires
// for uncaught errors in server components, route handlers, and middleware
// (Next 15+). We forward a minimal event to the monitoring reporter (inert
// unless a DSN is configured). Only the pathname is included — never query
// strings, headers, cookies, or bodies.

import { reportError } from '@/lib/monitoring/report'

export async function onRequestError(
  err: unknown,
  request: { path?: string },
  context: { routerKind?: string; routePath?: string; renderSource?: string },
): Promise<void> {
  const path = (request?.path || context?.routePath || '').split('?')[0]
  await reportError(err, { source: 'server', path, runtime: context?.renderSource ?? 'server' })
}
