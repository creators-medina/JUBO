// ─────────────────────────────────────────────────────────────────────────
// Onboarding question definitions — pure data.
//
// The wizard renders entirely from this array. Adding/removing a question is
// a data edit, not a component change. Mortgage-specific copy lives here (the
// product surface), never in the generators or the platform engines.
// ─────────────────────────────────────────────────────────────────────────

import type { StepDefinition } from '../types'

export const ONBOARDING_STEPS: StepDefinition[] = [
  {
    key: 'welcome',
    railLabel: 'Welcome',
    title: "Let's assemble your operating system",
    subtitle:
      'A few questions about your business and Jubo builds your boards, dashboards, goals, and automations around how you actually work.',
  },
  {
    key: 'production',
    railLabel: 'Production',
    title: 'Your production history',
    subtitle: 'This calibrates your pacing and funnel math. Estimates are fine — you can refine later.',
    questions: [
      { key: 'loans_closed_last_year',    label: 'Loans closed last year',        type: 'number',   placeholder: 'e.g. 36',       optional: true },
      { key: 'production_volume_last_year',label: 'Total production volume',        type: 'currency', placeholder: 'e.g. 12,000,000', optional: true },
      { key: 'average_loan_size',         label: 'Average loan size',              type: 'currency', placeholder: 'e.g. 350,000',  optional: true },
      { key: 'average_monthly_closings',  label: 'Average monthly closings',       type: 'number',   placeholder: 'e.g. 3',        optional: true },
      { key: 'team_size',                 label: 'Current team size',              type: 'number',   placeholder: 'e.g. 1',        optional: true },
    ],
  },
  {
    key: 'goals',
    railLabel: 'Goals',
    title: 'What are you aiming for this year?',
    subtitle: 'Jubo turns these into production goals with monthly, weekly, and daily pacing automatically.',
    questions: [
      { key: 'target_closings',          label: 'Target closings this year',      type: 'number',   placeholder: 'e.g. 48' },
      { key: 'target_volume',            label: 'Target production volume',        type: 'currency', placeholder: 'e.g. 18,000,000', optional: true },
      { key: 'target_income',            label: 'Target income / revenue',         type: 'currency', placeholder: 'e.g. 300,000',  optional: true },
      { key: 'target_monthly_closings',  label: 'Target monthly closings',         type: 'number',   placeholder: 'e.g. 4',        optional: true },
      {
        key: 'biggest_bottleneck',
        label: 'Biggest bottleneck right now',
        type: 'select',
        optional: true,
        options: [
          { value: 'lead_volume',   label: 'Not enough leads' },
          { value: 'conversion',    label: 'Converting leads to apps' },
          { value: 'follow_up',     label: 'Consistent follow-up' },
          { value: 'pipeline',      label: 'Moving files to close' },
          { value: 'partners',      label: 'Growing referral partners' },
          { value: 'time',          label: 'Time / staying organized' },
        ],
      },
    ],
  },
  {
    // Phase 4 — business-planning intake. Seeds the same production_plan_*
    // answers the /production-plan page reads (features/production-plan/calc),
    // so the LO's plan is ready the moment onboarding finishes. Numbers here
    // are EDITABLE ASSUMPTIONS (placeholders suggest defaults; nothing is
    // saved unless the LO types it). Conversion rates are intentionally NOT
    // asked here — Phase 3 defaults apply, editable on /production-plan.
    key: 'plan',
    railLabel: 'Plan',
    title: 'Your business plan inputs',
    subtitle:
      'A quick planning intake: your net income goal and comp assumptions. Jubo reverse-engineers the funded loans and leads required — the full plan lives on the Production Plan page.',
    questions: [
      {
        key: 'production_plan_annual_net_income_goal',
        label: 'Annual net LO comp goal',
        helper: 'What YOU take home — not company revenue. Most LOs start from $500,000.',
        type: 'currency',
        placeholder: 'e.g. 500,000',
      },
      {
        key: 'production_plan_average_loan_amount',
        label: 'Average loan amount (planning)',
        helper: 'Your market’s typical loan. If you skip this, your average loan size from the Production step is used.',
        type: 'currency',
        placeholder: 'e.g. 400,000',
        optional: true,
      },
      {
        key: 'production_plan_gross_comp_bps',
        label: 'Gross comp (bps)',
        helper: 'Editable assumption — defaults to 275 bps if left blank.',
        type: 'number',
        placeholder: 'e.g. 275',
        optional: true,
      },
      {
        key: 'production_plan_lo_split_percent',
        label: 'LO net split (%)',
        helper: 'Your share of gross comp — defaults to 80% if left blank. Net comp is derived honestly (gross × split).',
        type: 'number',
        placeholder: 'e.g. 80',
        optional: true,
      },
      {
        key: 'daily_call_goal',
        label: 'Daily call goal',
        helper: 'Powers your Daily Call Log — defaults to 10 outbound calls/day.',
        type: 'number',
        placeholder: 'e.g. 10',
        optional: true,
      },
      {
        key: 'production_plan_lead_source_mix',
        label: 'Desired lead-source mix',
        helper:
          'Where you WANT business to come from — a planning target, not actual attribution (lead-source tracking on records comes later). Aim for a total of 100%.',
        type: 'source_mix',
        optional: true,
      },
      {
        key: 'realtor_partner_count',
        label: 'Realtor partners you work with',
        type: 'number',
        placeholder: 'e.g. 12',
        optional: true,
      },
      {
        key: 'past_client_count',
        label: 'Past clients in your database',
        type: 'number',
        placeholder: 'e.g. 250',
        optional: true,
      },
      {
        key: 'online_leads_per_month',
        label: 'Online leads per month (expected)',
        type: 'number',
        placeholder: 'e.g. 20',
        optional: true,
      },
      {
        key: 'target_markets',
        label: 'Target markets',
        helper: 'Cities/areas you focus on.',
        type: 'text',
        placeholder: 'e.g. Austin, Round Rock',
        optional: true,
      },
      {
        key: 'support_capacity',
        label: 'Support capacity',
        type: 'select',
        optional: true,
        options: [
          { value: 'just_me', label: 'Just me' },
          { value: 'shared_assistant', label: 'Shared assistant' },
          { value: 'dedicated_assistant', label: 'Dedicated assistant' },
          { value: 'full_team', label: 'Full team' },
        ],
      },
    ],
  },
  {
    key: 'workflow',
    railLabel: 'Business',
    title: 'How do you source business?',
    subtitle: 'This decides which boards and automations get switched on for you.',
    questions: [
      { key: 'self_source',   label: 'I self-source my own leads',        type: 'boolean' },
      { key: 'realtor_leads', label: 'I work realtor / partner referrals', type: 'boolean' },
      { key: 'past_clients',  label: 'I work past clients & database',     type: 'boolean' },
      { key: 'buys_leads',    label: 'I buy leads',                        type: 'boolean' },
      { key: 'recruiting',    label: "I'm recruiting loan officers",       type: 'boolean' },
      {
        key: 'team_or_solo',
        label: 'Team structure',
        type: 'select',
        options: [
          { value: 'solo', label: 'Solo producer' },
          { value: 'team', label: 'Team' },
        ],
      },
    ],
  },
  {
    key: 'focus',
    railLabel: 'Focus',
    title: 'Where should Jubo put its weight?',
    subtitle: 'Rank what matters most. Your Today cockpit, dashboards, and board order adapt to this.',
    questions: [
      {
        key: 'focus_weights',
        label: 'Focus areas',
        type: 'weighted',
        focusAreas: [
          { area: 'prospecting',    label: 'Prospecting',          helper: 'New leads & outreach' },
          { area: 'conversion',     label: 'Conversion',           helper: 'Leads → applications' },
          { area: 'follow_up',      label: 'Follow-up',            helper: 'Staying on top of everyone' },
          { area: 'partner_growth', label: 'Partner growth',       helper: 'Realtors & referral sources' },
          { area: 'pipeline',       label: 'Pipeline management',  helper: 'Moving files to close' },
          { area: 'recruiting',     label: 'Recruiting',           helper: 'Growing the team' },
          { area: 'retention',      label: 'Retention',            helper: 'Past clients & repeat' },
        ],
      },
    ],
  },
  {
    key: 'imports',
    railLabel: 'Imports',
    title: 'Bring your people with you',
    subtitle: 'Drop in your lists now and Jubo will guide the mapping next. (Full import lands in Phase 16.)',
  },
  {
    key: 'integrations',
    railLabel: 'Integrations',
    title: 'Connect your stack',
    subtitle: 'Set your intent now — wire up the live sync whenever you’re ready.',
  },
  {
    key: 'generating',
    railLabel: 'Build',
    title: 'Assembling your operating system',
    subtitle: 'Generating boards, dashboards, goals, and automations tailored to your answers.',
  },
  {
    key: 'done',
    railLabel: 'Done',
    title: 'Your operating system is ready',
    subtitle: 'Everything below was built around how you work. Jump in — or finish a few setup steps first.',
  },
]

export const STEP_ORDER = ONBOARDING_STEPS.map(s => s.key)

export function stepIndex(key: string): number {
  return STEP_ORDER.indexOf(key as never)
}
