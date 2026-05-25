// A representative Arive-via-Zapier payload for the in-app test/simulate tool.
// Shape is illustrative — the normalizer reads many key variants, so real
// payloads don't need to match this exactly.
export const SAMPLE_ARIVE_PAYLOAD = JSON.stringify(
  {
    loan_id: 'ARV-100432',
    event_type: 'loan.updated',
    borrower: {
      first_name: 'Jordan',
      last_name: 'Rivera',
      email: 'jordan.rivera@example.com',
      phone: '(480) 555-0192',
    },
    loan: {
      loan_amount: 415000,
      loan_type: 'Conventional',
      loan_purpose: 'Purchase',
      status: 'In Processing',
      milestone: 'Conditions',
      closing_date: '2026-07-15',
    },
  },
  null,
  2,
)
