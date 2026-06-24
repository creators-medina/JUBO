'use client'

// ─────────────────────────────────────────────────────────────────────────
// MortgageWorkspace (slimmed in the 10.x simplification pass) — the center
// column's entity-specific detail. Everything that duplicated the new reference
// layout was removed: loan summary (→ left Loan card), milestone (→ stage
// tracker), recent communications + pipeline history (→ unified timeline),
// key facts / lead / relationship / past-client overviews (→ left snapshot),
// and the quick-actions row (→ header + Move To + composer). Only the genuinely
// unique panels remain. Underlying mortgage actions/engines are untouched.
// ─────────────────────────────────────────────────────────────────────────

import { resolveWorkspaceTemplate } from '../templates/resolve'
import { PartnerCoachingPanel, LoanContributionPanel } from '../sections'
import type { MortgageData, SectionKey } from '../types'

/** Returns true when this record has a mortgage-specific template (not generic). */
export function hasMortgageTemplate(data: MortgageData): boolean {
  return resolveWorkspaceTemplate(data).key !== 'generic'
}

// Non-duplicative, entity-specific sections kept in the center column.
const KEEP_SECTIONS: SectionKey[] = ['partner_coaching', 'loan_contribution']

export function MortgageWorkspace({ data }: { data: MortgageData; onChanged?: () => void }) {
  const template = resolveWorkspaceTemplate(data)
  const sections = template.sections.filter((s) => KEEP_SECTIONS.includes(s))
  if (sections.length === 0) return null

  return (
    <div className="space-y-4">
      {sections.map((key) => {
        switch (key) {
          case 'partner_coaching':  return <PartnerCoachingPanel key={key} data={data} />
          case 'loan_contribution': return <LoanContributionPanel key={key} data={data} />
          default:                  return null
        }
      })}
    </div>
  )
}
