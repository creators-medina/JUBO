// Invite token helpers. The plaintext token is shown to the inviter exactly
// once (in the copyable link); only its SHA-256 hash is ever persisted.
import { randomBytes, createHash } from 'node:crypto'

/** A URL-safe, high-entropy single-use token. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Deterministic hash stored at rest and matched on accept. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
