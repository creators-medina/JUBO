'use client'

import { useState, useTransition } from 'react'
import { X, Phone, Mail, MessageSquare, Calendar, StickyNote } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logCommunication } from '../actions'
import {
  DEFAULT_DIRECTION, DEFAULT_OUTCOME, OUTCOMES_BY_CHANNEL, OUTCOME_LABEL,
  type CommunicationChannel, type CommunicationDirection, type CommunicationOutcome,
} from '../types'

const CHANNELS: { key: CommunicationChannel; label: string; icon: React.ElementType }[] = [
  { key: 'call', label: 'Call', icon: Phone },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'sms', label: 'SMS', icon: MessageSquare },
  { key: 'meeting', label: 'Meeting', icon: Calendar },
  { key: 'internal', label: 'Internal', icon: StickyNote },
]

export function LogCommunicationModal({
  recordId, initialChannel = 'call', onClose, onLogged,
}: {
  recordId: string
  initialChannel?: CommunicationChannel
  onClose: () => void
  onLogged: () => void
}) {
  const [channel, setChannel] = useState<CommunicationChannel>(initialChannel)
  const [direction, setDirection] = useState<CommunicationDirection>(DEFAULT_DIRECTION[initialChannel])
  const [outcome, setOutcome] = useState<CommunicationOutcome | null>(DEFAULT_OUTCOME[initialChannel])
  const [subject, setSubject] = useState('')
  const [summary, setSummary] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [makeTask, setMakeTask] = useState(false)
  const [setNext, setSetNext] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const pickChannel = (c: CommunicationChannel) => {
    setChannel(c)
    setDirection(DEFAULT_DIRECTION[c])
    setOutcome(DEFAULT_OUTCOME[c])
  }

  const submit = () => {
    setError(null)
    startTransition(async () => {
      const res = await logCommunication({
        recordId, channel, direction, outcome,
        subject: subject || null, summary: summary || null,
        followUpAt: followUp ? new Date(followUp).toISOString() : null,
        createFollowUpTask: makeTask && !!followUp,
        setNextAction: setNext,
      })
      if ('error' in res) { setError(res.error); return }
      onLogged()
      onClose()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Log communication</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-4">
          {/* Channel */}
          <div className="flex gap-1.5">
            {CHANNELS.map((c) => (
              <button key={c.key} onClick={() => pickChannel(c.key)}
                className={cn('flex flex-1 flex-col items-center gap-1 rounded-lg border px-2 py-2 text-2xs transition-colors',
                  channel === c.key ? 'border-jubo-navy/60 bg-jubo-navy/10 text-foreground' : 'border-border text-muted-foreground hover:bg-surface-2')}>
                <c.icon className="h-4 w-4" /> {c.label}
              </button>
            ))}
          </div>

          {/* Direction + outcome */}
          {channel !== 'internal' && (
            <div className="flex items-center gap-2">
              <select value={direction} onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
                className="rounded-md border border-border bg-surface-1 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="outbound">Outbound</option>
                <option value="inbound">Inbound</option>
              </select>
              {OUTCOMES_BY_CHANNEL[channel].length > 0 && (
                <select value={outcome ?? ''} onChange={(e) => setOutcome((e.target.value || null) as CommunicationOutcome | null)}
                  className="flex-1 rounded-md border border-border bg-surface-1 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  {OUTCOMES_BY_CHANNEL[channel].map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                </select>
              )}
            </div>
          )}

          {(channel === 'email' || channel === 'meeting') && (
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
              className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          )}

          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} placeholder="What happened? (optional)"
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring" />

          {/* Follow-up */}
          <div className="space-y-2 rounded-lg border border-border bg-surface-1 p-3">
            <label className="flex items-center justify-between gap-2 text-xs text-foreground">
              Follow-up date
              <input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={setNext} onChange={(e) => setSetNext(e.target.checked)} /> Set as next action
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={makeTask} onChange={(e) => setMakeTask(e.target.checked)} disabled={!followUp} /> Create follow-up task
            </label>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={submit} disabled={pending}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {pending ? 'Logging…' : 'Log it'}
          </button>
        </div>
      </div>
    </div>
  )
}
