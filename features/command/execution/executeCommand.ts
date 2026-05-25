'use client'

// Command execution wrapper. Every operational command (move stage, set next
// action, create task, etc.) runs through here so we get one consistent place
// for optimistic UI, toast feedback, rollback, and workspace refresh.
//
// This is deliberately the single choke-point that future automation + AI
// orchestration will also route through — keep it generic.

type ToastApi = {
  success: (message: string, opts?: { undo?: () => void | Promise<void> }) => void
  error: (message: string) => void
}

export type CommandExecution = {
  /** The async mutation (server action call). */
  run: () => Promise<void>
  /** Optional immediate UI hint applied before run() resolves. */
  optimistic?: () => void
  /** Undo previous optimistic state if run() throws. */
  rollback?: () => void
  /** recordId whose workspace should refresh after success (dispatches global event). */
  refreshRecordId?: string | null
  successMessage?: string
  errorMessage?: string
  /** Optional undo handler surfaced in the success toast. */
  undo?: () => void | Promise<void>
  /** Fired after a successful run (e.g. close the palette). */
  onDone?: () => void
}

export function dispatchWorkspaceRefresh(recordId?: string | null): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('jubo:refresh-workspace', { detail: { recordId: recordId ?? undefined } }))
}

export async function executeCommand(exec: CommandExecution, toast: ToastApi): Promise<boolean> {
  exec.optimistic?.()
  try {
    await exec.run()
    if (exec.refreshRecordId !== undefined) dispatchWorkspaceRefresh(exec.refreshRecordId)
    if (exec.successMessage) toast.success(exec.successMessage, exec.undo ? { undo: exec.undo } : undefined)
    exec.onDone?.()
    return true
  } catch (err) {
    exec.rollback?.()
    const msg = exec.errorMessage ?? (err instanceof Error ? err.message : 'Command failed')
    toast.error(msg)
    return false
  }
}
