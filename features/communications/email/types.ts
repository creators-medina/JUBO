// ─────────────────────────────────────────────────────────────────────────
// Phase B — Email (Resend) config. Mirrors the Twilio config shape: secrets
// (api_key) live server-side in integration_connections.config and never reach
// the browser. provider = 'resend' (integration_connections.provider is free
// text, so no migration is required).
// ─────────────────────────────────────────────────────────────────────────

export type EmailConfig = {
  api_key: string
  /** Verified sender address, e.g. "loans@yourdomain.com" (domain must be verified in Resend). */
  from_email: string
  from_name: string | null
  enabled: boolean
}
