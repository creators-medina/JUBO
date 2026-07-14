'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Lock, Download, CreditCard } from 'lucide-react'
import { useToast } from '@/features/feedback/ToastProvider'
import { updateOrganizationSettings } from './actions'
import { exportRecordsCsv, exportRecordFieldsCsv, exportNotesTasksCsv, type ExportResult } from './exportData'
import type { OrganizationSettings, OrgBilling } from './queries'

// A pragmatic shortlist — full IANA picker can come later. Covers US mortgage teams.
const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
]

export function OrganizationSettingsClient({
  org,
  billing,
  canEdit,
  role,
}: {
  org: OrganizationSettings
  billing?: OrgBilling | null
  canEdit: boolean
  role: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()

  const [name, setName] = useState(org.name ?? '')
  const [timezone, setTimezone] = useState(org.timezone ?? 'America/New_York')
  const [teamSize, setTeamSize] = useState(org.team_size != null ? String(org.team_size) : '')
  const [volume, setVolume] = useState(org.monthly_volume_goal != null ? String(org.monthly_volume_goal) : '')
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '')

  const save = () => {
    if (!canEdit) return
    startTransition(async () => {
      const res = await updateOrganizationSettings({
        name,
        timezone,
        team_size: teamSize.trim() === '' ? null : Number(teamSize),
        monthly_volume_goal: volume.trim() === '' ? null : Number(volume),
        logo_url: logoUrl,
      })
      if ('error' in res) {
        toast.error(
          res.error === 'name_required' ? 'Company name is required.' :
          res.error === 'forbidden' ? 'Only an owner or admin can edit organization settings.' :
          'Could not save organization settings.',
        )
        return
      }
      toast.success('Organization settings saved')
      router.refresh()
    })
  }

  const disabled = !canEdit || pending
  const initials = (name || org.slug || 'O').trim().slice(0, 2).toUpperCase()

  const [exporting, setExporting] = useState<string | null>(null)
  const runExport = (key: string, fn: () => Promise<ExportResult>) => {
    setExporting(key)
    fn()
      .then((res) => {
        if ('error' in res) {
          toast.error(res.error === 'forbidden' ? 'Only an owner or admin can export data.' : 'Could not export.')
          return
        }
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = res.filename
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Export ready — check your downloads')
      })
      .catch(() => toast.error('Could not export.'))
      .finally(() => setExporting(null))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><Building2 className="h-4.5 w-4.5 text-jubo-navy" /></div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Organization</h1>
          <p className="text-xs text-muted-foreground">Your company profile and workspace defaults.</p>
        </div>
        {!canEdit && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-medium text-muted-foreground">
            <Lock className="h-3 w-3" /> View only
          </span>
        )}
      </div>

      {!canEdit && (
        <p className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-xs text-muted-foreground">
          You&apos;re signed in as <span className="capitalize text-foreground">{role}</span>. Organization settings can only be
          changed by an owner or admin.
        </p>
      )}

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-sm font-semibold text-muted-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </div>
          <div className="min-w-0 flex-1">
            <Field label="Company logo URL (optional)">
              <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={disabled} placeholder="https://…/logo.png" className={inputCls} />
            </Field>
          </div>
        </div>

        <Field label="Company name">
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={disabled} placeholder="BOMAC Mortgage" className={inputCls} />
        </Field>

        <Field label="Timezone">
          <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={disabled} className={inputCls}>
            {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Team size">
            <input type="number" min={0} step={1} value={teamSize} onChange={(e) => setTeamSize(e.target.value)} disabled={disabled} placeholder="5" className={inputCls} />
          </Field>
          <Field label="Monthly volume goal ($)">
            <input type="number" min={0} step={1000} value={volume} onChange={(e) => setVolume(e.target.value)} disabled={disabled} placeholder="2000000" className={inputCls} />
          </Field>
        </div>

        {canEdit && (
          <button onClick={save} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {pending ? 'Saving…' : <><Check className="h-3.5 w-3.5" /> Save changes</>}
          </button>
        )}
      </section>

      {/* Data export — owner/admin only. Downloads current-org CSVs; read-only. */}
      {canEdit && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Export your data</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Download your organization&apos;s CRM data as CSV — your data is yours. Exports are read-only and scoped to this
              workspace. Message/SMS bodies are not included (see the offboarding guide).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ExportButton label="Records" busy={exporting === 'records'} onClick={() => runExport('records', exportRecordsCsv)} />
            <ExportButton label="Record fields" busy={exporting === 'fields'} onClick={() => runExport('fields', exportRecordFieldsCsv)} />
            <ExportButton label="Notes & tasks" busy={exporting === 'notes'} onClick={() => runExport('notes', exportNotesTasksCsv)} />
          </div>
        </section>
      )}

      {/* Plan & billing — owner/admin only, read-only display. Manual during private beta. */}
      {canEdit && billing && (
        <section className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-jubo-navy" />
            <h2 className="text-sm font-semibold text-foreground">Plan &amp; billing</h2>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Stat label="Plan" value={PLAN_LABELS[billing.plan_type] ?? billing.plan_type} />
            <Stat label="Billing status" value={STATUS_LABELS[billing.billing_status] ?? billing.billing_status} />
            <Stat label="Seats used" value={billing.seat_limit == null ? `${billing.seats_used} · unlimited` : `${billing.seats_used} / ${billing.seat_limit}`} />
          </dl>
          {billing.seat_limit != null && billing.seats_used >= billing.seat_limit && (
            <p className="rounded-lg border border-jubo-gold/40 bg-jubo-gold-soft/40 px-3 py-2 text-2xs text-foreground">
              You&apos;re at your seat limit. Contact us to add seats before inviting more teammates.
            </p>
          )}
          <p className="text-2xs text-muted-foreground">
            Billing is managed manually during private beta{billing.stripe_linked ? ' (Stripe linked)' : ''}. Self-serve
            checkout and plan changes arrive later — no automatic charges are configured.
          </p>
        </section>
      )}
    </div>
  )
}

const PLAN_LABELS: Record<string, string> = {
  internal: 'Internal', beta: 'Beta', paid_beta: 'Paid beta', trial: 'Trial', suspended: 'Suspended',
}
const STATUS_LABELS: Record<string, string> = {
  not_configured: 'Not configured', trialing: 'Trialing', active: 'Active',
  past_due: 'Past due', canceled: 'Canceled', suspended: 'Suspended',
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  )
}

function ExportButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 py-2 text-xs font-medium text-foreground hover:bg-surface-2 disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" /> {busy ? 'Exporting…' : label}
    </button>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy disabled:opacity-60 disabled:cursor-not-allowed'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}
