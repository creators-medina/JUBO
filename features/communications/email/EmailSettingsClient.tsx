'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase B — Resend connection form. Mirrors CommunicationsSettingsClient
// (Twilio). The API key is redacted server-side; leaving it blank preserves the
// stored key.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check } from 'lucide-react'
import { useToast } from '@/features/feedback/ToastProvider'
import { saveEmailConnection } from './actions'

export type RedactedEmail = {
  from_email: string
  from_name: string
  enabled: boolean
  hasKey: boolean
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'

export function EmailSettingsClient({ initial, connected }: { initial: RedactedEmail | null; connected: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [apiKey, setApiKey] = useState('')
  const [fromEmail, setFromEmail] = useState(initial?.from_email ?? '')
  const [fromName, setFromName] = useState(initial?.from_name ?? '')
  const [enabled, setEnabled] = useState(initial?.enabled ?? true)

  const save = () => {
    startTransition(async () => {
      const res = await saveEmailConnection({ api_key: apiKey, from_email: fromEmail, from_name: fromName, enabled })
      if ('error' in res) {
        toast.error(
          res.error === 'missing_from_email' ? 'A verified From address is required.'
          : res.error === 'missing_api_key' ? 'A Resend API key is required.'
          : 'Could not save connection.',
        )
        return
      }
      setApiKey('')
      toast.success('Email connection saved')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 pt-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><Mail className="h-4.5 w-4.5 text-jubo-navy" /></div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Email</h1>
          <p className="text-xs text-muted-foreground">Connect Resend to send email from Jubo. The sending domain must be verified in Resend.</p>
        </div>
        {connected && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-jubo-green-soft px-2.5 py-1 text-2xs font-medium text-jubo-green"><Check className="h-3 w-3" /> Connected</span>}
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <Field label={initial?.hasKey ? 'Resend API Key (leave blank to keep current)' : 'Resend API Key'}>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={initial?.hasKey ? '••••••••' : 're_xxxxxxxx…'} className={inputCls} />
        </Field>
        <Field label="From Email (verified domain)"><input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="loans@yourdomain.com" className={inputCls} /></Field>
        <Field label="From Name (optional)"><input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your Name" className={inputCls} /></Field>
        <Toggle label="Sending enabled" checked={enabled} onChange={setEnabled} />
        <button onClick={save} disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? 'Saving…' : 'Save connection'}
        </button>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-2 text-sm text-foreground">
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-surface-3'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </span>
      {label}
    </button>
  )
}
