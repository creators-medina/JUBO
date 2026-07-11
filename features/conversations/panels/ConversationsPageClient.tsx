'use client'

// ─────────────────────────────────────────────────────────────────────────
// Conversations inbox — foundation pass (core-nav audit PR C).
//
// UI/foundation only: clearer two-pane layout, client-side search over the
// already-loaded thread list, a labeled SMS composer bar, and an honest
// empty state that explains where threads come from. Every behavior is the
// EXISTING one: threads/messages from the same queries, sends through the
// same SMSComposeBox/sendSMS handler, mark-read through the same
// markThreadRead action with the same triggers (select a thread with
// unread → mark read; the first thread still auto-opens on mount exactly
// as before — changing that is a documented follow-up, not this PR).
// No fake data: an empty inbox stays visibly empty.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { MessageSquare, ArrowUpRight, ChevronLeft, Inbox, Phone, Copy, Search, PhoneCall, Plug, Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { ConversationTimeline } from '../timeline/ConversationTimeline'
import { SMSComposeBox } from '../compose/SMSComposeBox'
import { loadThreadMessages, markThreadRead } from '../actions'
import { TrackView } from '@/features/analytics/TrackView'
import type { ConversationMessage, ThreadListItem } from '../types'

function rel(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function threadInitials(t: ThreadListItem): string {
  const name = t.record_title ?? t.participant_name
  if (!name) return '#'
  const words = name.trim().split(/\s+/)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '#'
}

export function ConversationsPageClient({ threads }: { threads: ThreadListItem[] }) {
  const { openWorkspace } = useWorkspaceTabs()
  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.id ?? null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [unread, setUnread] = useState<Record<string, number>>(() => Object.fromEntries(threads.map((t) => [t.id, t.unread_count])))
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')

  const selected = threads.find((t) => t.id === selectedId) ?? null

  const open = useCallback((id: string) => {
    setSelectedId(id)
    startTransition(async () => {
      const msgs = await loadThreadMessages(id)
      setMessages(msgs)
    })
    if ((unread[id] ?? 0) > 0) {
      setUnread((u) => ({ ...u, [id]: 0 }))
      markThreadRead(id)
    }
  }, [unread])

  // Load the first thread's messages on mount (existing behavior, unchanged —
  // note: this also marks that thread read if it had unread; flagged in the
  // core-nav audit as a follow-up decision, deliberately NOT changed here).
  useEffect(() => { if (selectedId) open(selectedId) }, []) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <TrackView surface="conversations" />
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2">
          <Inbox className="h-6 w-6 text-muted-foreground" />
        </span>
        <p className="text-sm font-semibold text-foreground">No conversations yet</p>
        <div className="max-w-sm space-y-1.5 text-xs text-muted-foreground">
          <p>Threads appear here from real SMS activity — nothing is ever faked:</p>
          <p>• Send a text from any contact card&apos;s composer and the thread lands here.</p>
          <p>• Inbound texts create threads automatically once Twilio is connected.</p>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Link href="/prospecting"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
            <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Open the Daily Call Log
          </Link>
          <Link href="/settings/communications"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-1">
            <Plug className="h-3.5 w-3.5" aria-hidden /> Connect Twilio
          </Link>
        </div>
      </div>
    )
  }

  // Client-side search over the already-loaded list (name, phone, snippet) —
  // no new queries; clearing the box restores the full list.
  const q = query.trim().toLowerCase()
  const visible = q
    ? threads.filter((t) =>
        [t.record_title, t.participant_name, t.participant_phone, t.last_preview]
          .some((v) => v?.toLowerCase().includes(q)))
    : threads

  return (
    <div className="flex h-full overflow-hidden">
      <TrackView surface="conversations" />
      {/* Thread list */}
      <aside className={cn('flex w-full flex-shrink-0 flex-col overflow-hidden border-r border-border md:w-80', selected && 'hidden md:flex')}>
        <div className="flex-shrink-0 border-b border-border px-4 pb-2 pt-3">
          <p className="text-sm font-bold text-foreground">
            Conversations <span className="font-normal text-muted-foreground">· {threads.length}</span>
          </p>
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, message…"
              className="w-full rounded-md border border-border bg-surface-1 py-1.5 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-jubo-navy focus:outline-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No conversations match &ldquo;{query.trim()}&rdquo;.</p>
          ) : visible.map((t) => {
            const u = unread[t.id] ?? 0
            const active = selectedId === t.id
            return (
              <button key={t.id} onClick={() => open(t.id)}
                className={cn('flex w-full items-start gap-2.5 border-b border-border/70 py-3 pr-4 text-left transition-colors hover:bg-surface-1',
                  active ? 'border-l-2 border-l-primary bg-surface-1 pl-[14px]' : 'pl-4')}>
                <span className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-2xs font-bold',
                  u > 0 ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground')}>
                  {threadInitials(t)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn('truncate text-sm text-foreground', u > 0 ? 'font-bold' : 'font-medium')}>
                      {t.record_title ?? t.participant_name ?? t.participant_phone}
                    </span>
                    <span className="flex-shrink-0 text-2xs tabular-nums text-muted-foreground">{rel(t.last_message_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className={cn('truncate text-xs', u > 0 ? 'font-medium text-foreground/80' : 'text-muted-foreground')}>
                      {t.last_direction === 'inbound' ? '↓ ' : '↑ '}{t.last_preview ?? t.participant_phone}
                    </span>
                    {u > 0 && <span className="flex-shrink-0 rounded-full bg-primary px-1.5 text-2xs font-semibold tabular-nums text-primary-foreground">{u}</span>}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Conversation detail */}
      <section className={cn('flex flex-1 flex-col overflow-hidden', !selected && 'hidden md:flex')}>
        {selected ? (
          <>
            {/* Contact context — everything here is already-loaded thread
                data (record join); no extra fetches, nothing invented. */}
            <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
              <button onClick={() => setSelectedId(null)} className="md:hidden" aria-label="Back to conversations">
                <ChevronLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              <MessageSquare className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{selected.record_title ?? selected.participant_name ?? selected.participant_phone}</p>
                <div className="flex items-center gap-1.5">
                  <a href={`tel:${selected.participant_phone}`} className="inline-flex items-center gap-1 truncate text-2xs text-primary hover:underline">
                    <Phone className="h-3 w-3" aria-hidden /> {selected.participant_phone}
                  </a>
                  <button onClick={() => navigator.clipboard?.writeText(selected.participant_phone)} title="Copy number" className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                    <Copy className="h-3 w-3" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="ml-auto flex flex-shrink-0 items-center gap-1.5">
                {selected.record_board_id && (
                  <Link href={`/boards/${selected.record_board_id}`} title="Open this contact's board"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-1 hover:text-foreground">
                    <Columns3 className="h-3.5 w-3.5" aria-hidden /> Board
                  </Link>
                )}
                {selected.primary_record_id && (
                  <button onClick={() => openWorkspace({ recordId: selected.primary_record_id!, title: selected.record_title ?? selected.participant_phone })}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2">
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> Open contact
                  </button>
                )}
              </div>
            </header>
            <div className="flex-1 overflow-hidden">
              {pending && messages.length === 0
                ? <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
                : <ConversationTimeline messages={messages} />}
            </div>
            {/* Composer — the existing SMSComposeBox / sendSMS path, now with
                an explicit channel label so it's obvious what sending does. */}
            <div className="flex-shrink-0 border-t border-border bg-card">
              <p className="px-4 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                SMS · to {selected.participant_phone}
              </p>
              <SMSComposeBox threadId={selected.id} participantPhone={selected.participant_phone} onSent={() => open(selected.id)} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
            <MessageSquare className="h-6 w-6 text-muted-foreground/60" aria-hidden />
            <p className="text-xs text-muted-foreground">Select a conversation to read and reply.</p>
          </div>
        )}
      </section>
    </div>
  )
}
