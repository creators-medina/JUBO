'use client'

import { useRef, useState } from 'react'
import { Upload, Check, FileSpreadsheet } from 'lucide-react'
import { cn } from '@/lib/utils'
import { recordOnboardingUpload } from '../actions'
import type { OnboardingUploadKind } from '../types'

const UPLOAD_KINDS: { kind: OnboardingUploadKind; label: string; hint: string }[] = [
  { kind: 'past_clients', label: 'Past clients',  hint: 'Your closed-loan database' },
  { kind: 'active_leads', label: 'Active leads',  hint: 'Borrowers in progress' },
  { kind: 'call_list',    label: 'Call list',     hint: 'Prospects to work' },
  { kind: 'realtors',     label: 'Realtor / partner list', hint: 'Referral relationships' },
  { kind: 'loans',        label: 'Loan pipeline', hint: 'Active files' },
]

const ACCEPT = '.csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function ImportCenter({ organizationId }: { organizationId: string }) {
  const [done, setDone] = useState<Record<string, string>>({})

  return (
    <div className="space-y-3">
      {UPLOAD_KINDS.map((u) => (
        <UploadRow
          key={u.kind}
          organizationId={organizationId}
          kind={u.kind}
          label={u.label}
          hint={u.hint}
          uploadedName={done[u.kind]}
          onUploaded={(name) => setDone((d) => ({ ...d, [u.kind]: name }))}
        />
      ))}
      <div className="rounded-lg border border-dashed border-border bg-surface-1/50 px-4 py-3">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Column mapping is coming next.</span>{' '}
          For now Jubo records what you dropped in so we can map it to your boards in the next release.
        </p>
      </div>
    </div>
  )
}

function UploadRow({
  organizationId,
  kind,
  label,
  hint,
  uploadedName,
  onUploaded,
}: {
  organizationId: string
  kind: OnboardingUploadKind
  label: string
  hint: string
  uploadedName?: string
  onUploaded: (name: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      await recordOnboardingUpload(organizationId, {
        kind,
        file_name: file.name,
        mime_type: file.type || undefined,
        size_bytes: file.size,
      })
      onUploaded(file.name)
    } catch {
      /* surfaced as no checkmark */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 rounded-lg border px-4 py-3 transition-colors',
        uploadedName ? 'border-primary/50 bg-primary/5' : 'border-border bg-surface-1',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{uploadedName ?? hint}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50',
          uploadedName
            ? 'text-primary'
            : 'bg-surface-2 text-foreground hover:bg-surface-3',
        )}
      >
        {uploadedName ? <Check className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        {busy ? 'Adding…' : uploadedName ? 'Replace' : 'Upload'}
      </button>
    </div>
  )
}
