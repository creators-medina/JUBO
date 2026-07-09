'use client'

// ─────────────────────────────────────────────────────────────────────────
// Contact-card messaging pieces (Step 9 split — moved VERBATIM out of
// PersonFileCard, no behavior change):
//   • Feed — the date-grouped conversation/activity timeline
//   • Composer — the SMS / Email / Note / Task compose box (SMS sends via
//     the existing SMSComposeBox; note/task saves stay routed to the
//     card's footer Save — no write paths live here)
//   • Filter type + activity classification helpers
// ─────────────────────────────────────────────────────────────────────────

import { Loader2, Plug, ArrowUpRight, ArrowDownLeft, MessageSquare, Mail, StickyNote, ListChecks } from 'lucide-react'
import type { PersonCardData } from './actions'
import { nameInitials } from './FileSummary'
import type { CommunicateContext } from '@/features/communications/communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { cn } from '@/lib/utils'

export type Filter = 'all' | 'comms' | 'tasks' | 'pipeline'

export function activityCategory(t: string): Filter | 'other' {
  if (['call', 'email', 'sms', 'comment', 'note', 'meeting'].includes(t)) return 'comms'
  if (['status_change', 'field_change', 'creation', 'integration_event'].includes(t)) return 'pipeline'
  if (t.includes('task') || t === 'assignment') return 'tasks'
  return 'other'
}

function feedTag(activityType: string): string {
  const t = activityType.toLowerCase()
  if (t.includes('call')) return 'CALL'
  if (t.includes('email')) return 'EMAIL'
  if (t.includes('sms') || t.includes('text')) return 'SMS'
  if (t.includes('meeting')) return 'MEETING'
  if (t.includes('note')) return 'NOTE'
  if (t.includes('task')) return 'TASK'
  if (t.includes('status') || t.includes('movement') || t.includes('group')) return 'PIPELINE'
  return 'EVENT'
}

export function Feed({
  card, comms, filter, borrowerName, ownerName, tall, flow,
}: {
  card: PersonCardData
  comms: CommunicateContext | undefined
  filter: Filter
  /** Sender identities for the message bubbles (real people, never invented). */
  borrowerName?: string
  ownerName?: string | null
  /** Taller scroll area for the Overview conversation workspace. */
  tall?: boolean
  /** Layout 4a Conversations card — natural height up to ~30rem (internal
   *  scroll past that) so the composer sits directly under the latest
   *  message. Presentation only; items/order/data untouched. */
  flow?: boolean
}) {
  type Item = { id: string; kind: 'sms' | 'activity'; ts: string; direction?: string; body?: string | null; label?: string; tag: string; cat: Filter | 'other' }
  const items: Item[] = []
  for (const m of comms?.messages ?? []) items.push({ id: `s-${m.id}`, kind: 'sms', ts: m.occurred_at, direction: m.direction, body: m.body, tag: 'SMS', cat: 'comms' })
  for (const a of card.activities) items.push({ id: `a-${a.id}`, kind: 'activity', ts: a.created_at, label: a.content ?? a.activity_type, tag: feedTag(a.activity_type), cat: activityCategory(a.activity_type) })
  // Reference timeline reads oldest → newest with day separators.
  const shown = items
    .filter((i) => filter === 'all' || i.cat === filter)
    .sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))

  const day = (ts?: string) => (ts ? ts.split('T')[0] : '')
  const fmtDay = (d: string) => {
    const dt = new Date(`${d}T00:00:00`)
    return isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  }
  const fmtTime = (ts?: string) => {
    if (!ts) return ''
    const dt = new Date(ts)
    return isNaN(dt.getTime()) ? '' : dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  if (shown.length === 0) return <div className={cn('px-3 py-8 text-center text-2xs text-muted-foreground', tall && 'flex-1')}>Nothing here yet.</div>

  // Precompute day-separator flags (a render-time mutation would violate the
  // immutable-render rule).
  const rows: { item: Item; sep: boolean }[] = []
  {
    let lastDay = ''
    for (const item of shown) {
      const d = day(item.ts)
      rows.push({ item, sep: Boolean(d) && d !== lastDay })
      if (d) lastDay = d
    }
  }
  return (
    <div className={cn('space-y-2 overflow-y-auto p-3', flow ? 'max-h-[30rem]' : tall ? 'min-h-[16rem] flex-1' : 'max-h-72')}>
      {rows.map(({ item: i, sep }) => {
        const d = day(i.ts)
        return (
          <div key={i.id} className="space-y-2">
            {sep && (
              <div className="flex justify-center pt-1">
                <span className="rounded border border-jubo-border bg-jubo-card-soft px-2 py-0.5 text-[9px] font-semibold tracking-wider text-jubo-muted">
                  {fmtDay(d)}
                </span>
              </div>
            )}
            {i.kind === 'sms' ? (
              <div className={cn('flex items-end gap-2', i.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                {i.direction !== 'outbound' && (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-jubo-red text-[9px] font-bold text-white">
                    {nameInitials(borrowerName)}
                  </span>
                )}
                <div className="max-w-[78%]">
                  <div className={cn('mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground', i.direction === 'outbound' && 'justify-end')}>
                    {i.direction === 'outbound' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}
                    <span className="font-semibold">{i.direction === 'outbound' ? (ownerName ?? 'You') : (borrowerName ?? 'Contact')}</span>
                    <span className="font-semibold tracking-wider text-jubo-muted">{i.tag}</span>
                  </div>
                  <div className={cn(
                    'rounded-xl px-3 py-1.5 text-xs leading-relaxed',
                    i.direction === 'outbound'
                      ? 'border border-jubo-red/15 bg-jubo-red/10 text-jubo-text'
                      : 'border border-jubo-border bg-jubo-card text-jubo-text',
                  )}>
                    {i.body}
                  </div>
                  <div className={cn('mt-0.5 text-[9px] text-muted-foreground', i.direction === 'outbound' && 'text-right')}>{fmtTime(i.ts)}</div>
                </div>
                {i.direction === 'outbound' && (
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[9px] font-bold text-white" style={{ background: '#3f83c4' }}>
                    {nameInitials(ownerName ?? 'You')}
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-jubo-border bg-jubo-card text-[8px] font-bold tracking-wider text-jubo-muted">
                  {i.tag.slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <span className="mr-1.5 rounded bg-surface-2 px-1 py-0.5 text-[9px] font-semibold tracking-wider text-muted-foreground">{i.tag}</span>
                  <span className="text-xs text-foreground/80">{i.label}</span>
                  <span className="ml-1 text-2xs text-muted-foreground">· {fmtTime(i.ts)}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Composer({
  recordId, comms, email, onChanged, mode, onModeChange, text, onTextChange, onSubmit, onSmsDraftChange,
}: {
  recordId: string
  comms: CommunicateContext | undefined
  email: string | null
  onChanged: () => void
  mode: 'sms' | 'email' | 'note' | 'task'
  onModeChange: (m: 'sms' | 'email' | 'note' | 'task') => void
  text: string
  onTextChange: (t: string) => void
  /** Enter-to-save for the task input — routed to the footer Save action. */
  onSubmit: () => void
  /** Mirrors the SMS draft up so the footer can warn before closing over it. */
  onSmsDraftChange?: (text: string) => void
}) {
  const MODES: { key: typeof mode; label: string; Icon: React.ElementType }[] = [
    { key: 'sms', label: 'SMS', Icon: MessageSquare },
    { key: 'email', label: 'Email', Icon: Mail },
    { key: 'note', label: 'Note', Icon: StickyNote },
    { key: 'task', label: 'Task', Icon: ListChecks },
  ]

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {MODES.map(({ key, label, Icon }) => (
          <button key={key} onClick={() => onModeChange(key)}
            className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium transition-colors',
              mode === key ? 'bg-jubo-navy text-white' : 'text-muted-foreground hover:text-foreground')}>
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
      </div>

      {mode === 'sms' ? (
        !comms ? (
          <div className="flex items-center gap-2 py-1 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> …</div>
        ) : !comms.twilioConnected ? (
          <a href="/settings/communications" className="flex items-center gap-1.5 text-2xs text-muted-foreground hover:text-foreground"><Plug className="h-3 w-3" /> Connect Twilio to text</a>
        ) : !comms.phone ? (
          <p className="text-2xs text-muted-foreground">Add a phone number to enable texting.</p>
        ) : (
          <SMSComposeBox recordId={recordId} participantPhone={comms.phone} onSent={onChanged} onDraftChange={onSmsDraftChange} compact />
        )
      ) : mode === 'email' ? (
        email ? (
          <div className="space-y-1">
            <textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={2} placeholder={`Write an email to ${email}…`}
              className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
            <p className="text-[10px] text-muted-foreground">Opens your mail app — use the button below right.</p>
          </div>
        ) : <p className="text-2xs text-muted-foreground">No email on file for this contact.</p>
      ) : mode === 'note' ? (
        <textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={2} placeholder="Write a note… (Save is below right)"
          className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      ) : (
        <input value={text} onChange={(e) => onTextChange(e.target.value)} placeholder="New task… (Enter or Save below right)"
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit() }}
          className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      )}
    </div>
  )
}
