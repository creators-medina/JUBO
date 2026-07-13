// Deterministic checks for the pure invite-email template. Runnable with
// `node --test` (or the ad hoc esbuild bundle used in CI-less dev).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInviteEmail } from './inviteEmail'

const base = {
  orgName: 'Acme Mortgage',
  inviterName: 'Jane Smith',
  role: 'member',
  acceptUrl: 'https://app.example.com/invite/accept?token=abc123',
  invitedEmail: 'lo@example.com',
  expiresInDays: 7,
}

test('includes org, role, inviter, accept link, email, and expiry', () => {
  const { subject, html, text } = buildInviteEmail(base)
  assert.match(subject, /Acme Mortgage/)
  for (const body of [html, text]) {
    assert.ok(body.includes('Acme Mortgage'), 'org name')
    assert.ok(body.includes('member'), 'role')
    assert.ok(body.includes('Jane Smith'), 'inviter')
    assert.ok(body.includes(base.acceptUrl), 'accept link')
    assert.ok(body.includes('lo@example.com'), 'invited email')
    assert.ok(body.includes('7 days'), 'expiry')
  }
})

test('works without an inviter name', () => {
  const { html, text } = buildInviteEmail({ ...base, inviterName: null })
  assert.ok(html.includes('You have been invited'))
  assert.ok(text.includes('You have been invited'))
})

test('escapes HTML in user-controlled fields (no injection)', () => {
  const { html } = buildInviteEmail({ ...base, orgName: '<script>alert(1)</script>' })
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script must not appear')
  assert.ok(html.includes('&lt;script&gt;'), 'escaped form present')
})

test('carries no CRM/sensitive data beyond invite context', () => {
  const { html, text } = buildInviteEmail(base)
  // Sanity: the only URL present is the accept link (no other links leaked).
  const urls = (html.match(/https?:\/\/[^"'<>\s]+/g) ?? []).filter((u) => u !== base.acceptUrl)
  assert.equal(urls.length, 0, `unexpected URLs: ${urls.join(', ')}`)
  assert.ok(!/loan|ssn|borrower|record/i.test(text), 'no CRM terms in text body')
})
