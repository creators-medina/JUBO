// ─────────────────────────────────────────────────────────────────────────
// Phase SEC-LOCK — the single locked-field renderer.
//
// Sensitive fields (SSN/ITIN, financial account numbers) are locked BY
// CONSTRUCTION until an encryption / field-vault-at-rest layer exists: this
// renders a disabled chip in place of the input. It takes no value and no
// onSave, so there is no write path and no raw-value display for a locked slug.
// The real encryption pass is a separate future phase; flipping `sensitive`
// off (or swapping this renderer) re-enables the inputs everywhere at once.
// ─────────────────────────────────────────────────────────────────────────

import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export function LockedField({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-xs text-jubo-muted">{label}</span>
      <span
        className="flex items-center gap-1.5 rounded-md border border-dashed border-jubo-border bg-jubo-card-soft px-2 py-1 text-2xs text-jubo-muted"
        title="Locked until secure storage is enabled"
      >
        <Lock className="h-3 w-3 flex-shrink-0" /> Locked — secure storage coming soon
      </span>
    </div>
  )
}
