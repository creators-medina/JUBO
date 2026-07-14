'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, MessageSquare, Phone, Mail, Plug, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { getCommunicateContext, type CommunicateContext } from '../communicate'
import { SMSComposeBox } from '@/features/conversations/compose/SMSComposeBox'
import { EmailComposeBox } from '@/features/communications/email/EmailComposeBox'
import { CommunicationActions } from './CommunicationActions'
import { NoteList } from '@/features/workspace/notes/NoteList'
import { cn } from '@/lib/utils'

/**
 * Communicate tab (Phase 36E-1) — record-scoped contact cockpit (single column,
 * fits the side panel). REAL SMS (reuses the Phase 26 stack) + REAL Notes with
 * @mentions; Call/Email are honestly LOG-ONLY (tel:/mailto: + the existing
 * logger). No fake doing-buttons. The Overview read-model is untouched.
 */
export function CommunicateView({ recordId, organizationId }: { recordId: string; organizationId: string }) {
  const [ctx, setCtx] = useState<CommunicateContext | undefined>(undefined)

  const load = useCallback(() => {
    getCommunicateContext(recordId).then(setCtx).catch(() => setCtx(null))
  }, [recordId])
  useEffect(() => { load() }, [load])

  if (ctx === undefined) {
    return <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
  }
  if (ctx === null) {
    return <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">Unavailable for this record.</div>
  }

  return (
    <div className="space-y-4">
      {/* Contact identity */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-1.5 jubo-los-section-label">Contact</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-muted-foreground" />{ctx.phone || <span className="text-muted-foreground">No phone</span>}</span>
          <span className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-muted-foreground" />{ctx.email || <span className="text-muted-foreground">No email</span>}</span>
        </div>
      </div>

      {/* SMS — the one real channel */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 jubo-los-section-label">
          <MessageSquare className="h-3 w-3" /> Text messages
        </p>

        {!ctx.twilioConnected ? (
          <Link href="/settings/communications" className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground hover:bg-surface-1">
            <Plug className="h-3.5 w-3.5" /> Connect Twilio to enable texting →
          </Link>
        ) : !ctx.phone ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Add a phone number to this record to enable texting.</div>
        ) : (
          <>
            <div className="mb-2 max-h-64 space-y-1.5 overflow-y-auto">
              {ctx.messages.length === 0 ? (
                <p className="py-2 text-2xs text-muted-foreground">No messages yet. Send the first text below.</p>
              ) : (
                ctx.messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                    <div className={cn('max-w-[80%] rounded-2xl px-2.5 py-1.5 text-xs text-jubo-text', m.direction === 'outbound' ? 'rounded-tr-sm border border-jubo-border bg-jubo-card' : 'rounded-tl-sm bg-jubo-card-soft')}>
                      <span className="mb-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {m.direction === 'outbound' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownLeft className="h-2.5 w-2.5" />}
                        {m.occurred_at?.split('T')[0]}
                      </span>
                      {m.body}
                    </div>
                  </div>
                ))
              )}
            </div>
            <SMSComposeBox recordId={recordId} participantPhone={ctx.phone} onSent={load} compact />
            <p className="mt-1.5 text-[10px] text-muted-foreground">Replies (STOP) are honored automatically. Ensure A2P 10DLC is registered for this number.</p>
          </>
        )}
      </div>

      {/* Email — real send via Resend */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 flex items-center gap-1.5 jubo-los-section-label">
          <Mail className="h-3 w-3" /> Email
        </p>
        {!ctx.emailConnected ? (
          <Link href="/settings/communications" className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground hover:bg-surface-1">
            <Plug className="h-3.5 w-3.5" /> Connect email (Resend) to enable sending →
          </Link>
        ) : !ctx.email ? (
          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">Add an email address to this record to enable email.</div>
        ) : (
          <EmailComposeBox recordId={recordId} toEmail={ctx.email} onSent={load} />
        )}
      </div>

      {/* Notes + @mentions (real) */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 jubo-los-section-label">Notes</p>
        <NoteList organizationId={organizationId} recordId={recordId} notes={ctx.notes} currentUserId={ctx.currentUserId} members={ctx.members} />
      </div>

      {/* Call — honest log-only (no Voice integration) */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="mb-2 jubo-los-section-label">Log call</p>
        <div className="mb-2 flex flex-wrap gap-2 text-xs">
          {ctx.phone && <a href={`tel:${ctx.phone}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-1"><Phone className="h-3 w-3" /> Call {ctx.phone}</a>}
        </div>
        {/* Existing real logger — records call outcomes (logging only). */}
        <CommunicationActions recordId={recordId} onChanged={load} />
      </div>
    </div>
  )
}
