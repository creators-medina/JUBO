// ─────────────────────────────────────────────────────────────────────────
// SystemExecutionContext — the trusted server-side context the runtime worker
// and scheduler act under.
//
// Because there's no service-role key, the runtime executes inside an
// AUTHENTICATED member session (Today-load drain / manual / command). That
// session supplies auth.uid(), so the existing workflow + movement engines work
// unchanged. Worker-generated side-effects are tagged with `source` for audit.
// ─────────────────────────────────────────────────────────────────────────

export type ExecutionSource = 'integration' | 'scheduler' | 'manual'

export type SystemExecutionContext = {
  organizationId: string
  /** the member whose session is draining the queue (acts on behalf of the org) */
  userId: string
  source: ExecutionSource
}
