// Deterministic checks for the pure theme-day diagnosis classifier (node:test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyDiagnosis, type DiagnosisInput } from './diagnoseClassify'

const base: DiagnosisInput = {
  inFinalRoster: false,
  notArchived: true,
  statusActive: true,
  topLevel: true,
  hasDoNotContact: false,
  boardInEffectiveSource: true,
  effectiveMode: 'playbook',
  qualifiesPreCap: true,
  withinCap: true,
}

test('in the real roster → should_appear (anchors on live logic)', () => {
  assert.equal(classifyDiagnosis({ ...base, inFinalRoster: true }), 'should_appear')
})

test('record-level exclusions take priority, in order', () => {
  assert.equal(classifyDiagnosis({ ...base, notArchived: false }), 'archived')
  assert.equal(classifyDiagnosis({ ...base, statusActive: false }), 'status_inactive')
  assert.equal(classifyDiagnosis({ ...base, topLevel: false }), 'child_record')
  assert.equal(classifyDiagnosis({ ...base, hasDoNotContact: true }), 'do_not_contact')
})

test('day off is reported before board sourcing', () => {
  assert.equal(classifyDiagnosis({ ...base, effectiveMode: 'off', boardInEffectiveSource: false }), 'day_off')
})

test('board not sourced: schedule override vs playbook no-match', () => {
  assert.equal(classifyDiagnosis({ ...base, boardInEffectiveSource: false, effectiveMode: 'boards' }), 'schedule_override')
  assert.equal(classifyDiagnosis({ ...base, boardInEffectiveSource: false, effectiveMode: 'playbook' }), 'board_not_sourced')
  assert.equal(classifyDiagnosis({ ...base, boardInEffectiveSource: false, effectiveMode: 'any' }), 'board_not_sourced')
})

test('sourced + eligible but beyond the cap → past_cap', () => {
  assert.equal(classifyDiagnosis({ ...base, qualifiesPreCap: true, withinCap: false }), 'past_cap')
})

test('archived beats board-sourcing when both are wrong', () => {
  assert.equal(classifyDiagnosis({ ...base, notArchived: false, boardInEffectiveSource: false }), 'archived')
})

test('unknown only as a safety net', () => {
  // qualifies, within cap, but somehow not in the final roster — should not happen
  assert.equal(classifyDiagnosis({ ...base, qualifiesPreCap: true, withinCap: true, inFinalRoster: false }), 'unknown')
})
