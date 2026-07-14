// Deterministic checks for the pure CSV export helpers (node:test).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeCsvCell, toCsv, fieldValueToString, fullName } from './csv'

test('escapeCsvCell quotes commas, quotes, and newlines', () => {
  assert.equal(escapeCsvCell('plain'), 'plain')
  assert.equal(escapeCsvCell('a,b'), '"a,b"')
  assert.equal(escapeCsvCell('she said "hi"'), '"she said ""hi"""')
  assert.equal(escapeCsvCell('line1\nline2'), '"line1\nline2"')
  assert.equal(escapeCsvCell(null), '')
  assert.equal(escapeCsvCell(1234), '1234')
})

test('toCsv builds a header + rows with CRLF and escaping (CSV-injection-safe quoting)', () => {
  const csv = toCsv(['Name', 'Note'], [['Acme, Inc', 'has "quotes"'], ['B', null]])
  assert.equal(csv, 'Name,Note\r\n"Acme, Inc","has ""quotes"""\r\nB,')
})

test('fieldValueToString flattens each typed value', () => {
  assert.equal(fieldValueToString({ value_text: 'hello' }), 'hello')
  assert.equal(fieldValueToString({ value_number: 350000 }), '350000')
  assert.equal(fieldValueToString({ value_boolean: true }), 'true')
  assert.equal(fieldValueToString({ value_boolean: false }), 'false')
  assert.equal(fieldValueToString({ value_date: '2026-07-01T00:00:00Z' }), '2026-07-01T00:00:00Z')
  assert.equal(fieldValueToString({ value_json: ['a', 'b'] }), 'a; b')
  assert.equal(fieldValueToString({}), '')
  // text wins over other populated columns
  assert.equal(fieldValueToString({ value_text: 'x', value_number: 9 }), 'x')
})

test('fullName prefers name, falls back to email', () => {
  assert.equal(fullName({ first_name: 'Jane', last_name: 'Smith' }), 'Jane Smith')
  assert.equal(fullName({ first_name: 'Jane', last_name: null }), 'Jane')
  assert.equal(fullName({ email: 'lo@x.com' }), 'lo@x.com')
  assert.equal(fullName(null), '')
})
