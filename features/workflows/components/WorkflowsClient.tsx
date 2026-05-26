'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Workflow, Zap, Clock, AlertTriangle, ArrowRightLeft, Plus, Play, RefreshCw, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/date'
import { setWorkflowEnabled, runWorkflowScansAction } from '../actions'
import { templateById } from '../registry/templates'
import type { WorkflowRow, WorkflowExecutionRow, WorkflowTriggerType } from '../types'

const TRIGGER_META: Record<WorkflowTriggerType, { label: string; icon: React.ElementType; color: string }> = {
  'record.created':        { label: 'Record created',     icon: Plus,          color: 'text-blue-400' },
  'record.updated':        { label: 'Record updated',     icon: RefreshCw,     color: 'text-cyan-400' },
  'record.group_changed':  { label: 'Stage changes',      icon: ArrowRightLeft, color: 'text-violet-400' },
  'no_activity_detected':  { label: 'No activity',        icon: AlertTriangle, color: 'text-amber-400' },
  'next_action_overdue':   { label: 'Next action overdue', icon: Clock,        color: 'text-red-400' },
}

interface Props {
  organizationId: string
  workflows: WorkflowRow[]
  executions: WorkflowExecutionRow[]
}

export function WorkflowsClient({ organizationId, workflows, executions }: Props) {
  const router = useRouter()
  const [isScanning, startScan] = useTransition()
  const [scanResult, setScanResult] = useState<string | null>(null)

  const runScans = () => {
    setScanResult(null)
    startScan(async () => {
      try {
        const { scanned } = await runWorkflowScansAction(organizationId)
        setScanResult(`Scanned ${scanned} record${scanned === 1 ? '' : 's'}`)
        router.refresh()
      } catch {
        setScanResult('Scan failed')
      }
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Workflow className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Workflows</h1>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-lg">
              Operational automations that move records forward — create tasks, set next actions,
              and surface attention as things happen. Toggle any workflow on or off.
            </p>
          </div>
        </div>
        <button
          onClick={runScans}
          disabled={isScanning}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 disabled:opacity-50 transition-colors flex-shrink-0"
          title="Run no-activity + overdue scans now"
        >
          <RefreshCw className={cn('w-3 h-3', isScanning && 'animate-spin')} />
          Run scans
        </button>
      </header>

      {scanResult && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-1 border border-border text-xs text-muted-foreground">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          {scanResult}
        </div>
      )}

      {/* Workflow list */}
      <section className="space-y-2">
        {workflows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">No workflows installed yet</p>
            <p className="text-xs text-muted-foreground mt-1">Default templates install automatically on first load.</p>
          </div>
        ) : (
          workflows.map(wf => <WorkflowRowCard key={wf.id} workflow={wf} />)
        )}
      </section>

      {/* Execution history */}
      {executions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recent Activity</h2>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {executions.map(ex => <ExecutionRow key={ex.id} execution={ex} />)}
          </div>
        </section>
      )}
    </div>
  )
}

function WorkflowRowCard({ workflow }: { workflow: WorkflowRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const meta = TRIGGER_META[workflow.trigger_type]
  const Icon = meta?.icon ?? Zap
  const template = templateById(workflow.template_id)

  const toggle = () => {
    startTransition(async () => {
      try { await setWorkflowEnabled(workflow.id, !workflow.enabled); router.refresh() } catch {}
    })
  }

  const actionSummary = template
    ? template.actions.map(a => ACTION_LABEL[a.kind] ?? a.kind).join(' · ')
    : '—'

  return (
    <div className={cn('rounded-xl border bg-card p-4 transition-colors', workflow.enabled ? 'border-border' : 'border-border/50 opacity-70')}>
      <div className="flex items-start gap-3">
        <span className={cn('w-8 h-8 rounded-lg bg-surface-1 flex items-center justify-center flex-shrink-0', meta?.color)}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-foreground">{workflow.title}</p>
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground">{meta?.label ?? workflow.trigger_type}</span>
          </div>
          {workflow.description && <p className="text-xs text-muted-foreground mt-0.5">{workflow.description}</p>}
          <div className="flex items-center gap-3 mt-2 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Play className="w-2.5 h-2.5" /> {actionSummary}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-2xs text-muted-foreground/70">
            <span>{workflow.execution_count} run{workflow.execution_count === 1 ? '' : 's'}</span>
            {workflow.last_run_at && <span>· last {formatDistanceToNow(workflow.last_run_at)}</span>}
          </div>
        </div>

        <button
          onClick={toggle}
          disabled={isPending}
          role="switch"
          aria-checked={workflow.enabled}
          className={cn(
            'relative w-9 h-5 rounded-full transition-colors flex-shrink-0 disabled:opacity-50',
            workflow.enabled ? 'bg-primary' : 'bg-surface-3',
          )}
          title={workflow.enabled ? 'Disable' : 'Enable'}
        >
          <span className={cn(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
            workflow.enabled ? 'translate-x-4' : 'translate-x-0.5',
          )} />
        </button>
      </div>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  create_task: 'Create task',
  set_next_action: 'Set next action',
  create_daily_action: 'Add daily action',
  log_activity: 'Log activity',
  flag_attention: 'Flag attention',
}

function ExecutionRow({ execution }: { execution: WorkflowExecutionRow }) {
  const statusColor =
    execution.status === 'success' ? 'text-emerald-400' :
    execution.status === 'skipped' ? 'text-muted-foreground' :
    execution.status === 'partial' ? 'text-amber-400' : 'text-red-400'

  const ran = (execution.actions_executed ?? []).filter(a => !('skipped' in a && (a as { skipped?: boolean }).skipped))
  const summary = ran.length > 0
    ? ran.map(a => ACTION_LABEL[a.kind] ?? a.kind).join(', ')
    : execution.status === 'skipped' ? 'Conditions not met' : 'No actions'

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusColor.replace('text-', 'bg-'))} />
      <span className="text-xs text-foreground flex-1 truncate">{summary}</span>
      <span className={cn('text-2xs uppercase tracking-wider', statusColor)}>{execution.status}</span>
      <span className="text-2xs text-muted-foreground tabular-nums flex-shrink-0">{formatDistanceToNow(execution.created_at)}</span>
    </div>
  )
}
