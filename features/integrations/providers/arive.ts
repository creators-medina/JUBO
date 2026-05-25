// ─────────────────────────────────────────────────────────────────────────
// Arive (via Zapier) payload normalizer.
//
// The exact Arive/Zapier payload shape varies, so this reads many candidate
// key names case-insensitively and looks one level into common containers
// (borrower / loan / data / fields). Unknown shapes still normalize — anything
// not recognized stays in `raw` for later mapping. No hard dependency on one shape.
// ─────────────────────────────────────────────────────────────────────────

import type { NormalizedEvent, IntegrationEntityType } from '../types'

type AnyObj = Record<string, unknown>

const CONTAINERS = ['borrower', 'loan', 'data', 'fields', 'contact', 'lead', 'attributes']

/** Case-insensitive lookup across the object + common nested containers. */
function pick(payload: AnyObj, names: string[]): string | undefined {
  const wanted = names.map((n) => n.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const scan = (obj: AnyObj): string | undefined => {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null || typeof v === 'object') continue
      const nk = k.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (wanted.includes(nk)) {
        const s = `${v}`.trim()
        if (s !== '') return s
      }
    }
    return undefined
  }
  const top = scan(payload)
  if (top !== undefined) return top
  for (const c of CONTAINERS) {
    const sub = payload[c]
    if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
      const hit = scan(sub as AnyObj)
      if (hit !== undefined) return hit
    }
  }
  return undefined
}

function toNumber(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export function normalizeArive(payload: unknown): NormalizedEvent {
  const obj = (payload && typeof payload === 'object' ? payload : {}) as AnyObj

  const firstName = pick(obj, ['first_name', 'firstName', 'borrower_first_name', 'first'])
  const lastName = pick(obj, ['last_name', 'lastName', 'borrower_last_name', 'last'])
  let fullName = pick(obj, ['full_name', 'fullName', 'name', 'borrower_name', 'borrower'])
  if (!fullName) fullName = [firstName, lastName].filter(Boolean).join(' ') || undefined

  const loanAmount = toNumber(pick(obj, ['loan_amount', 'loanAmount', 'amount', 'base_loan_amount', 'loan_amt']))
  const status = pick(obj, ['status', 'loan_status', 'loanStatus'])
  const milestone = pick(obj, ['milestone', 'stage', 'current_milestone', 'loan_milestone'])

  const hasLoan = loanAmount != null || status != null || milestone != null
  const entityType: IntegrationEntityType = hasLoan ? 'loan' : 'lead'

  return {
    sourceProvider: 'arive_zapier',
    externalId: pick(obj, ['arive_loan_id', 'loan_id', 'loanId', 'loan_guid', 'loanGuid', 'external_id', 'id']),
    externalEventId: pick(obj, ['event_id', 'eventId', 'zap_id', 'request_id', 'requestId']),
    eventType: pick(obj, ['event_type', 'event', 'trigger']) ?? 'sync',
    entityType,
    person: {
      firstName,
      lastName,
      fullName,
      email: pick(obj, ['email', 'email_address', 'borrower_email', 'emailAddress']),
      phone: pick(obj, ['phone', 'phone_number', 'phoneNumber', 'mobile', 'cell', 'borrower_phone']),
    },
    loan: {
      loanAmount,
      loanPurpose: pick(obj, ['loan_purpose', 'purpose', 'loanPurpose']),
      occupancy: pick(obj, ['occupancy', 'occupancy_type']),
      loanType: pick(obj, ['loan_type', 'loanType', 'program']),
      status,
      milestone,
      closingDate: pick(obj, ['closing_date', 'close_date', 'est_closing_date', 'closingDate', 'estClosingDate']),
    },
    raw: payload,
  }
}
