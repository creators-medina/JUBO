// ─────────────────────────────────────────────────────────────────────────
// Twilio X-Twilio-Signature validation — Node crypto, no 'twilio' package.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
//   signature = base64( HMAC-SHA1( fullUrl + sortedConcatenatedParams, authToken ) )
// For application/x-www-form-urlencoded bodies, params are the POST fields,
// sorted by key, concatenated as key+value (no separators), appended to the URL.
// ─────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from 'crypto'

export function expectedTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort()
  let data = url
  for (const k of sortedKeys) data += k + params[k]
  return createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64')
}

export function validateTwilioSignature(args: {
  signature: string | null
  url: string
  params: Record<string, string>
  authToken: string
}): boolean {
  const { signature, url, params, authToken } = args
  if (!signature || !authToken) return false
  const expected = expectedTwilioSignature(authToken, url, params)
  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}
