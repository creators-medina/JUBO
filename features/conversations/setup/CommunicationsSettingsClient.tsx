'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Check } from 'lucide-react'
import { useToast } from '@/features/feedback/ToastProvider'
import { saveTwilioConnection } from '../actions'

export type RedactedTwilio = {
  account_sid: string
  messaging_service_sid: string
  twilio_phone: string
  inbound_enabled: boolean
  outbound_enabled: boolean
  hasToken: boolean
}

export function CommunicationsSettingsClient({ initial, connected }: { initial: RedactedTwilio | null; connected: boolean }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [accountSid, setAccountSid] = useState(initial?.account_sid ?? '')
  const [authToken, setAuthToken] = useState('')
  const [msgSvc, setMsgSvc] = useState(initial?.messaging_service_sid ?? '')
  const [phone, setPhone] = useState(initial?.twilio_phone ?? '')
  const [inbound, setInbound] = useState(initial?.inbound_enabled ?? true)
  const [outbound, setOutbound] = useState(initial?.outbound_enabled ?? true)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const save = () => {
    startTransition(async () => {
      const res = await saveTwilioConnection({
        account_sid: accountSid, auth_token: authToken,
        messaging_service_sid: msgSvc, twilio_phone: phone,
        inbound_enabled: inbound, outbound_enabled: outbound,
      })
      if ('error' in res) {
        toast.error(res.error === 'missing_credentials' ? 'Account SID and Auth Token are required.' : 'Could not save connection.')
        return
      }
      setAuthToken('')
      toast.success('Twilio connection saved')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><MessageSquare className="h-4.5 w-4.5 text-jubo-navy" /></div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Communications</h1>
          <p className="text-xs text-muted-foreground">Connect Twilio to send and receive SMS from Jubo.</p>
        </div>
        {connected && <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-jubo-green-soft px-2.5 py-1 text-2xs font-medium text-jubo-green"><Check className="h-3 w-3" /> Connected</span>}
      </div>

      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <Field label="Account SID"><input value={accountSid} onChange={(e) => setAccountSid(e.target.value)} placeholder="ACxxxxxxxx…" className={inputCls} /></Field>
        <Field label={initial?.hasToken ? 'Auth Token (leave blank to keep current)' : 'Auth Token'}>
          <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder={initial?.hasToken ? '••••••••' : 'Twilio auth token'} className={inputCls} />
        </Field>
        <Field label="Messaging Service SID (recommended)"><input value={msgSvc} onChange={(e) => setMsgSvc(e.target.value)} placeholder="MGxxxxxxxx…" className={inputCls} /></Field>
        <Field label="From Phone Number (E.164, if not using a Messaging Service)"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+12125551234" className={inputCls} /></Field>
        <div className="flex gap-6">
          <Toggle label="Inbound enabled" checked={inbound} onChange={setInbound} />
          <Toggle label="Outbound enabled" checked={outbound} onChange={setOutbound} />
        </div>
        <button onClick={save} disabled={pending} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {pending ? 'Saving…' : 'Save connection'}
        </button>
      </section>

      <section className="space-y-2 rounded-xl border border-border bg-surface-1 p-5">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Twilio webhook URLs</h2>
        <p className="text-xs text-muted-foreground">In the Twilio console, set your number/messaging service webhooks to:</p>
        <Mono label="Inbound (A message comes in)" url={`${origin}/api/webhooks/twilio/inbound`} />
        <Mono label="Status callback" url={`${origin}/api/webhooks/twilio/status`} />
        <p className="text-2xs text-muted-foreground">Secrets are stored server-side only and never sent back to the browser.</p>
      </section>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="rounded border-border" /> {label}
    </label>
  )
}
function Mono({ label, url }: { label: string; url: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <code className="block truncate rounded-md border border-border bg-card px-2 py-1.5 text-2xs text-foreground">{url}</code>
    </div>
  )
}
