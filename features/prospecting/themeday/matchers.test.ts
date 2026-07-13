// Deterministic verification that a newly provisioned template org resolves all
// five Daily Call Log theme days. Written for `node --test` (node:test) so it
// runs when a test runner is wired up; also runnable ad hoc via esbuild bundle.
//
// Guards two things:
//   1. The onboarding board TEMPLATES provide a source board for every weekday
//      (no "source board not found" for new orgs).
//   2. The locked theme-day source mapping (canonical names) has not drifted.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_TEMPLATES } from '@/features/onboarding/templates/boards'
import { resolveThemeDaySources, DAY_BOARD_SPECS, THEME_WEEKDAYS } from './matchers'

const TEMPLATE_BOARD_NAMES = BOARD_TEMPLATES.map((b) => b.name)

test('newly provisioned template org resolves all five theme days', () => {
  const res = resolveThemeDaySources(TEMPLATE_BOARD_NAMES)
  for (const weekday of THEME_WEEKDAYS) {
    assert.equal(res[weekday].missing.length, 0, `weekday ${weekday} missing: ${res[weekday].missing.join(', ')}`)
    assert.ok(res[weekday].matched.length > 0, `weekday ${weekday} matched nothing`)
  }
})

test('Tuesday resolves BOTH an in-process and an inactive board', () => {
  const res = resolveThemeDaySources(TEMPLATE_BOARD_NAMES)
  // Two specs (active + inactive) must both match a distinct board.
  assert.equal(res[2].missing.length, 0)
  assert.ok(res[2].matched.length >= 2, `Tuesday matched: ${res[2].matched.join(', ')}`)
})

test('specific template boards map to the expected weekdays', () => {
  const res = resolveThemeDaySources(TEMPLATE_BOARD_NAMES)
  assert.ok(res[1].matched.some((n) => /realtor/i.test(n)), 'Mon → a Realtors board')
  assert.ok(res[2].matched.some((n) => /in process/i.test(n)), 'Tue → Loan In Process')
  assert.ok(res[2].matched.some((n) => /inactive/i.test(n)), 'Tue → Inactive Loans')
  assert.ok(res[3].matched.some((n) => /pre-?approved/i.test(n)), 'Wed → Pre-Approved')
  assert.ok(res[4].matched.some((n) => /past clients/i.test(n)), 'Thu → Past Clients')
  assert.ok(res[5].matched.some((n) => /vip/i.test(n)), 'Fri → VIPs')
})

test('locked theme-day source mapping is unchanged (canonical names)', () => {
  const canonical = Object.fromEntries(
    THEME_WEEKDAYS.map((d) => [d, DAY_BOARD_SPECS[d].map((s) => s.canonical)]),
  )
  assert.deepEqual(canonical, {
    1: ['Realtors (Top 40)'],
    2: ['Loan In Process', 'Inactive Loans'],
    3: ['Pre-Approved'],
    4: ['Past Clients'],
    5: ['VIPs'],
  })
})
