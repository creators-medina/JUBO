'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Target, Filter, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CreateFunnelModal } from './CreateFunnelModal'
import { FunnelStagesEditor } from './FunnelStagesEditor'
import { AssumptionsEditor } from './AssumptionsEditor'
import { CreateGoalModal } from './CreateGoalModal'
import { GoalCard } from './GoalCard'
import type {
  FunnelRow, FunnelStageRow, ConversionAssumptionRow, ProductionGoalRow,
} from '../types'

interface Board { id: string; name: string }
interface BoardGroup { id: string; name: string; board_id: string }

interface Props {
  organizationId: string
  funnels: FunnelRow[]
  stagesByFunnel: Record<string, FunnelStageRow[]>
  assumptions: ConversionAssumptionRow[]
  goals: ProductionGoalRow[]
  boards: Board[]
  boardGroupsByBoard: Record<string, BoardGroup[]>
}

type Tab = 'goals' | 'funnels' | 'assumptions'

export function GoalsPageClient({
  organizationId, funnels, stagesByFunnel, assumptions, goals, boards, boardGroupsByBoard,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('goals')
  const [showCreateFunnel, setShowCreateFunnel] = useState(false)
  const [showCreateGoal, setShowCreateGoal] = useState(false)
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(funnels[0]?.id ?? null)

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId) ?? null
  const selectedStages = selectedFunnelId ? (stagesByFunnel[selectedFunnelId] ?? []) : []

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Target className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-foreground">Performance & Goals</h1>
            <p className="text-xs text-muted-foreground">Define funnels, set conversion assumptions, and pace toward production goals.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'goals' && (
            <button
              onClick={() => setShowCreateGoal(true)}
              disabled={funnels.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              title={funnels.length === 0 ? 'Create a funnel first' : undefined}
            >
              <Plus className="w-3.5 h-3.5" />
              New Goal
            </button>
          )}
          {tab === 'funnels' && (
            <button
              onClick={() => setShowCreateFunnel(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Funnel
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-border flex-shrink-0">
        <TabButton active={tab === 'goals'}       onClick={() => setTab('goals')}       icon={Target}     label="Goals" count={goals.length} />
        <TabButton active={tab === 'funnels'}     onClick={() => setTab('funnels')}     icon={Filter}     label="Funnels" count={funnels.length} />
        <TabButton active={tab === 'assumptions'} onClick={() => setTab('assumptions')} icon={Sparkles}  label="Conversion Assumptions" count={assumptions.length} />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto">
        {tab === 'goals' && (
          <GoalsTab
            goals={goals}
            funnels={funnels}
            stagesByFunnel={stagesByFunnel}
            assumptions={assumptions}
            organizationId={organizationId}
          />
        )}

        {tab === 'funnels' && (
          <FunnelsTab
            funnels={funnels}
            stagesByFunnel={stagesByFunnel}
            selectedFunnel={selectedFunnel}
            selectedStages={selectedStages}
            onSelectFunnel={setSelectedFunnelId}
            boards={boards}
            boardGroupsByBoard={boardGroupsByBoard}
            organizationId={organizationId}
          />
        )}

        {tab === 'assumptions' && (
          <AssumptionsTab
            funnels={funnels}
            stagesByFunnel={stagesByFunnel}
            assumptions={assumptions}
            organizationId={organizationId}
          />
        )}
      </div>

      {showCreateFunnel && (
        <CreateFunnelModal
          organizationId={organizationId}
          boards={boards}
          boardGroupsByBoard={boardGroupsByBoard}
          onClose={() => setShowCreateFunnel(false)}
        />
      )}

      {showCreateGoal && (
        <CreateGoalModal
          organizationId={organizationId}
          funnels={funnels}
          onClose={() => setShowCreateGoal(false)}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, count }: { active: boolean; onClick: () => void; icon: React.ElementType; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
        active
          ? 'bg-surface-2 text-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-surface-1',
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {count > 0 && (
        <span className={cn('text-2xs px-1.5 py-0.5 rounded-full', active ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-muted-foreground')}>
          {count}
        </span>
      )}
    </button>
  )
}

// ── Goals tab ────────────────────────────────────────────────────────────────

function GoalsTab({
  goals, funnels, stagesByFunnel, assumptions, organizationId,
}: {
  goals: ProductionGoalRow[]
  funnels: FunnelRow[]
  stagesByFunnel: Record<string, FunnelStageRow[]>
  assumptions: ConversionAssumptionRow[]
  organizationId: string
}) {
  if (goals.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-surface-1 flex items-center justify-center">
          <Target className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No production goals yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            {funnels.length === 0
              ? 'Start by defining a funnel with stages, then set conversion assumptions, then create a goal.'
              : 'Click “New Goal” to set targets and let the engine compute your pacing.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
      {goals.map(goal => {
        const funnel = funnels.find(f => f.id === goal.funnel_id) ?? null
        const stages = goal.funnel_id ? (stagesByFunnel[goal.funnel_id] ?? []) : []
        return (
          <GoalCard
            key={goal.id}
            goal={goal}
            funnel={funnel}
            stages={stages}
            assumptions={assumptions}
            organizationId={organizationId}
          />
        )
      })}
    </div>
  )
}

// ── Funnels tab ──────────────────────────────────────────────────────────────

function FunnelsTab({
  funnels, stagesByFunnel, selectedFunnel, selectedStages, onSelectFunnel,
  boards, boardGroupsByBoard, organizationId,
}: {
  funnels: FunnelRow[]
  stagesByFunnel: Record<string, FunnelStageRow[]>
  selectedFunnel: FunnelRow | null
  selectedStages: FunnelStageRow[]
  onSelectFunnel: (id: string) => void
  boards: Board[]
  boardGroupsByBoard: Record<string, BoardGroup[]>
  organizationId: string
}) {
  if (funnels.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <Filter className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No funnels yet</p>
        <p className="text-xs text-muted-foreground max-w-md">A funnel is an ordered set of stages — leads, qualifications, outcomes, etc. Stages can be linked to board groups so current performance flows in automatically.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Left: funnel list */}
      <div className="w-64 border-r border-border flex-shrink-0 overflow-y-auto p-3">
        <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">Funnels</p>
        {funnels.map(f => (
          <button
            key={f.id}
            onClick={() => onSelectFunnel(f.id)}
            className={cn(
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
              selectedFunnel?.id === f.id
                ? 'bg-surface-2 text-foreground'
                : 'text-muted-foreground hover:bg-surface-1 hover:text-foreground',
            )}
          >
            <p className="font-medium truncate">{f.name}</p>
            <p className="text-2xs text-muted-foreground mt-0.5">
              {(stagesByFunnel[f.id]?.length ?? 0)} stages
            </p>
          </button>
        ))}
      </div>

      {/* Right: stage editor */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedFunnel ? (
          <FunnelStagesEditor
            funnel={selectedFunnel}
            stages={selectedStages}
            boards={boards}
            boardGroupsByBoard={boardGroupsByBoard}
            organizationId={organizationId}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Select a funnel from the left.</p>
        )}
      </div>
    </div>
  )
}

// ── Assumptions tab ──────────────────────────────────────────────────────────

function AssumptionsTab({
  funnels, stagesByFunnel, assumptions, organizationId,
}: {
  funnels: FunnelRow[]
  stagesByFunnel: Record<string, FunnelStageRow[]>
  assumptions: ConversionAssumptionRow[]
  organizationId: string
}) {
  if (funnels.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6">
        <Sparkles className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Set up a funnel first</p>
        <p className="text-xs text-muted-foreground">Conversion rates are defined between stages — you need stages before you can set rates.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {funnels.map(funnel => {
        const stages = stagesByFunnel[funnel.id] ?? []
        const funnelAssumptions = assumptions.filter(a =>
          stages.some(s => s.id === a.funnel_stage_id),
        )
        if (stages.length < 2) {
          return (
            <div key={funnel.id} className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-1">{funnel.name}</h3>
              <p className="text-xs text-muted-foreground">Add at least two stages to define conversion rates.</p>
            </div>
          )
        }
        return (
          <AssumptionsEditor
            key={funnel.id}
            funnel={funnel}
            stages={stages}
            assumptions={funnelAssumptions}
            organizationId={organizationId}
          />
        )
      })}
    </div>
  )
}
