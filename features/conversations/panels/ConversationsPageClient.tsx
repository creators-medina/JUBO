'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { MessageSquare, ArrowUpRight, ChevronLeft, Inbox, Phone, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { ConversationTimeline } from '../timeline/ConversationTimeline'
import { SMSComposeBox } from '../compose/SMSComposeBox'
import { loadThreadMessages, markThreadRead } from '../actions'
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

export function ConversationsPageClient({ threads }: { threads: ThreadListItem[] }) {
  const { openWorkspace } = useWorkspaceTabs()
  const [selectedId, setSelectedId] = useState<string | null>(threads[0]?.id ?? null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [unread, setUnread] = useState<Record<string, number>>(() => Object.fromEntries(threads.map((t) => [t.id, t.unread_count])))
  const [pending, startTransition] = useTransition()

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

  // Load the first thread's messages on mount.
  useEffect(() => { if (selectedId) open(selectedId) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (threads.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">No conversations yet</p>
        <p className="max-w-xs text-xs text-muted-foreground">Inbound texts and messages you send will appear here. Connect Twilio in Settings → Communications.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Thread list */}
      <aside className={cn('w-full flex-shrink-0 overflow-y-auto border-r border-border md:w-80', selected && 'hidden md:block')}>
        {threads.map((t) => {
          const u = unread[t.id] ?? 0
          return (
            <button key={t.id} onClick={() => open(t.id)}
              className={cn('flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface-1',
                selectedId === t.id && 'bg-surface-1')}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{t.record_title ?? t.participant_name ?? t.participant_phone}</span>
                <span className="flex-shrink-0 text-2xs text-muted-foreground">{rel(t.last_message_at)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-muted-foreground">{t.last_direction === 'inbound' ? '↓ ' : '↑ '}{t.last_preview ?? t.participant_phone}</span>
                {u > 0 && <span className="flex-shrink-0 rounded-full bg-primary px-1.5 text-2xs font-semibold text-primary-foreground tabular-nums">{u}</span>}
              </div>
            </button>
          )
        })}
      </aside>

      {/* Conversation detail */}
      <section className={cn('flex flex-1 flex-col overflow-hidden', !selected && 'hidden md:flex')}>
        {selected ? (
          <>
            <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
              <button onClick={() => setSelectedId(null)} className="md:hidden"><ChevronLeft className="h-5 w-5 text-muted-foreground" /></button>
              <MessageSquare className="h-4 w-4 text-primary" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{selected.record_title ?? selected.participant_name ?? selected.participant_phone}</p>
                <div className="flex items-center gap-1.5">
                  <a href={`tel:${selected.participant_phone}`} className="inline-flex items-center gap-1 truncate text-2xs text-primary hover:underline">
                    <Phone className="h-3 w-3" /> {selected.participant_phone}
                  </a>
                  <button onClick={() => navigator.clipboard?.writeText(selected.participant_phone)} title="Copy number" className="flex-shrink-0 text-muted-foreground transition-colors hover:text-foreground">
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {selected.primary_record_id && (
                <button onClick={() => openWorkspace({ recordId: selected.primary_record_id!, title: selected.record_title ?? selected.participant_phone })}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2">
                  <ArrowUpRight className="h-3.5 w-3.5" /> Workspace
                </button>
              )}
            </header>
            <div className="flex-1 overflow-hidden">
              {pending && messages.length === 0
                ? <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
                : <ConversationTimeline messages={messages} />}
            </div>
            <SMSComposeBox threadId={selected.id} participantPhone={selected.participant_phone} onSent={() => open(selected.id)} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Select a conversation</div>
        )}
      </section>
    </div>
  )
}
