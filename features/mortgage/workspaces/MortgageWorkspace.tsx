'use client'

import { useTransition } from 'react'
import { PhoneCall, CalendarPlus, ChevronRight, Handshake, CalendarHeart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { resolveWorkspaceTemplate } from '../templates/resolve'
import { computeOpportunitySignals } from '../scoring/opportunities'
import {
  LeadOverview, LoanSummary, MilestoneTracker, RelationshipSummary, PastClientOverview,
  KeyFacts, OpportunitySignals, PipelineHistory,
} from '../sections'
import {
  markContacted, scheduleFollowUp, advanceMilestone, addPartnerTouch, createAnniversaryReminder,
} from '../actions'
import { RecentCommunications } from '@/features/communications/components/RecentCommunications'
import type { CommunicationLog } from '@/features/communications/types'
import type { MortgageData, SectionKey } from '../types'

/** Returns true when this record has a mortgage-specific template (not generic). */
export function hasMortgageTemplate(data: MortgageData): boolean {
  return resolveWorkspaceTemplate(data).key !== 'generic'
}

export function MortgageWorkspace({ data, onChanged }: { data: MortgageData; onChanged?: () => void }) {
  const template = resolveWorkspaceTemplate(data)
  const signals = computeOpportunitySignals(data, template.key)

  const renderSection = (key: SectionKey) => {
    switch (key) {
      case 'lead_overview':         return <LeadOverview key={key} data={data} />
      case 'loan_summary':          return <LoanSummary key={key} data={data} />
      case 'milestone_tracker':     return <MilestoneTracker key={key} data={data} />
      case 'relationship_summary':  return <RelationshipSummary key={key} data={data} />
      case 'past_client_overview':  return <PastClientOverview key={key} data={data} />
      case 'pipeline_history':      return <PipelineHistory key={key} data={data} />
      case 'opportunity_signals':   return <OpportunitySignals key={key} signals={signals} />
      case 'key_facts':             return <KeyFacts key={key} data={data} />
    }
  }

  const comms = (data.communications ?? []) as unknown as CommunicationLog[]

  return (
    <div className="space-y-4">
      <QuickActions data={data} templateKey={template.key} onChanged={onChanged} />
      {template.sections.map(renderSection)}
      {comms.length > 0 && <RecentCommunications logs={comms} />}
    </div>
  )
}

function QuickActions({ data, templateKey, onChanged }: { data: MortgageData; templateKey: string; onChanged?: () => void }) {
  const [pending, startTransition] = useTransition()
  const recordId = data.record.id
  const orgId = data.record.organization_id
  const boardId = data.record.board_id

  const run = (fn: () => Promise<unknown>) => startTransition(async () => { await fn(); onChanged?.() })

  const Btn = ({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) => (
    <button onClick={onClick} disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
    </button>
  )

  return (
    <div className="flex flex-wrap gap-2">
      {(templateKey === 'lead' || templateKey === 'loan') && (
        <>
          <Btn icon={PhoneCall} label="Mark contacted" onClick={() => run(() => markContacted(recordId, orgId))} />
          <Btn icon={CalendarPlus} label="Schedule follow-up" onClick={() => run(() => scheduleFollowUp(recordId, 2))} />
          <Btn icon={ChevronRight} label="Advance stage" onClick={() => run(() => advanceMilestone(recordId, boardId))} />
        </>
      )}
      {templateKey === 'partner' && (
        <Btn icon={Handshake} label="Add partner touch" onClick={() => run(() => addPartnerTouch(recordId, orgId))} />
      )}
      {templateKey === 'past_client' && (
        <Btn icon={CalendarHeart} label="Anniversary reminder" onClick={() => run(() => createAnniversaryReminder(recordId, orgId))} />
      )}
    </div>
  )
}
