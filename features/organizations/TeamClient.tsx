'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Users, MoreHorizontal, Shield, UserMinus, Ban, CircleCheck, Info, UserPlus, Copy, X, Link2, Briefcase, LifeBuoy, Network } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/features/feedback/ToastProvider'
import type { TeamMember, PendingInvite, SupportLink } from './queries'
import { changeMemberRole, setMemberStatus, removeMember, setMemberType, assignSupportToProducer, unassignSupport } from './team'
import { inviteMember, revokeInvitation, refreshInviteLink } from './invites'

const INVITE_ROLES = ['member', 'manager', 'admin'] as const

const INVITE_ERRORS: Record<string, string> = {
  forbidden: 'Only an owner or admin can invite people.',
  unauthorized: 'Your session expired. Please sign in again.',
  invalid_email: 'Enter a valid email address.',
  invalid_role: 'Pick a valid role.',
  already_member: 'That person is already in this workspace.',
  already_invited: 'There’s already a pending invite for that email. Revoke it first to start over.',
  not_found: 'That invitation no longer exists.',
}

function inviteLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/invite/accept?token=${encodeURIComponent(token)}`
}

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

const ASSIGNABLE_ROLES = ['admin', 'manager', 'member'] as const

// Server error codes → human messages.
const ERRORS: Record<string, string> = {
  forbidden: 'Only an owner or admin can manage the team.',
  unauthorized: 'Your session expired. Please sign in again.',
  not_found: 'That member no longer exists.',
  last_owner: 'You can’t remove, disable, or demote the last owner. Promote another owner first.',
  admin_cannot_demote_owner: 'Only the owner can change the owner’s role.',
  admin_cannot_disable_owner: 'Only the owner can disable an owner.',
  admin_cannot_remove_owner: 'Admins can’t remove the owner.',
  cannot_disable_self: 'You can’t disable your own access.',
  cannot_remove_self: 'You can’t remove yourself from the organization.',
  transfer_not_available: 'Transferring ownership isn’t available yet — it arrives in a later phase.',
  invalid_role: 'That role isn’t valid.',
  invalid_status: 'That status isn’t valid.',
  invalid_member_type: 'That member type isn’t valid.',
  same_user: 'A person can’t support themselves.',
  not_in_org: 'That person isn’t in this workspace.',
  not_a_support_user: 'Only support users can be assigned to a producer.',
  not_a_producer: 'You can only assign support to a producer.',
  already_linked: 'That support user already supports this producer.',
}

export function TeamClient({
  members,
  pendingInvites = [],
  supportLinks = [],
  canManage,
  currentRole,
  currentUserId,
  emailConfigured = false,
}: {
  members: TeamMember[]
  pendingInvites?: PendingInvite[]
  supportLinks?: SupportLink[]
  canManage: boolean
  currentRole: string
  currentUserId: string
  emailConfigured?: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [manageLinksFor, setManageLinksFor] = useState<TeamMember | null>(null)

  // Names by user id (for rendering "Supports: …"); producers for the link picker.
  const nameByUser = new Map(members.map((m) => [m.userId, m.name]))
  const producers = members.filter((m) => m.memberType === 'producer')
  const producersForUser = (supportUserId: string) =>
    supportLinks.filter((l) => l.supportUserId === supportUserId)

  const run = (p: Promise<{ ok: true } | { error: string }>, success: string) => {
    startTransition(async () => {
      const res = await p
      if ('error' in res) {
        toast.error(ERRORS[res.error] ?? 'Something went wrong.')
        return
      }
      toast.success(success)
      router.refresh()
    })
  }

  const soloMember = members.length <= 1

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><Users className="h-4.5 w-4.5 text-jubo-navy" /></div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-foreground">Team</h1>
          <p className="text-xs text-muted-foreground">
            {canManage ? 'Manage who has access to this workspace and what they can do.' : 'People in this workspace.'}
          </p>
        </div>
        {canManage ? (
          <button
            onClick={() => setInviteOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-3.5 w-3.5" /> Invite user
          </button>
        ) : (
          <span className="ml-auto rounded-full bg-surface-2 px-2.5 py-1 text-2xs font-medium capitalize text-muted-foreground">{currentRole}</span>
        )}
      </div>

      {/* Invite-delivery note: emailed when a provider is configured, else link-only. */}
      {canManage && (
        <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-1 px-4 py-3">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            {emailConfigured ? (
              <>Invites are <span className="font-medium text-foreground">emailed automatically</span> to your teammate, with a copy-link fallback. Links expire in 7 days and are single-use.</>
            ) : (
              <>Email delivery isn&apos;t configured yet, so invites are <span className="font-medium text-foreground">link-based</span>: create one, copy its link, and send it to your teammate. Links expire in 7 days and are single-use.</>
            )}
          </p>
        </div>
      )}

      {/* Pending invitations */}
      {canManage && pendingInvites.length > 0 && (
        <PendingInvites invites={pendingInvites} pending={pending} run={run} emailConfigured={emailConfigured} />
      )}

      {soloMember ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2"><Users className="h-5 w-5 text-muted-foreground" /></div>
          <p className="text-sm font-medium text-foreground">It&apos;s just you right now</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Your workspace has one member. Once invitations land in Phase 31C, you&apos;ll be able to add loan officers,
            processors, and assistants here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-2xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Member type</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                {canManage && <th className="px-4 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {members.map((m) => (
                <tr key={m.membershipId} className={m.status === 'disabled' ? 'opacity-55' : undefined}>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{m.name}</span>
                    {m.isSelf && <span className="ml-1.5 text-2xs text-muted-foreground">(you)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={m.role} /></td>
                  <td className="px-4 py-3">
                    <MemberTypeBadge type={m.memberType} />
                    {m.memberType === 'support' && (
                      <p className="mt-1 text-2xs text-muted-foreground">
                        {producersForUser(m.userId).length === 0
                          ? <span className="text-jubo-gold">No producers yet</span>
                          : <>Supports: {producersForUser(m.userId).map((l) => nameByUser.get(l.producerUserId) ?? '—').join(', ')}</>}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtDate(m.joinedAt)}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <RowActions
                        member={m}
                        currentRole={currentRole}
                        currentUserId={currentUserId}
                        pending={pending}
                        onChangeRole={(role) => run(changeMemberRole(m.membershipId, role), `${m.name} is now ${role}`)}
                        onSetStatus={(status) => run(setMemberStatus(m.membershipId, status), status === 'disabled' ? `${m.name} disabled` : `${m.name} re-enabled`)}
                        onSetMemberType={(t) => run(setMemberType(m.membershipId, t), `${m.name} is now a ${t}`)}
                        onManageLinks={() => setManageLinksFor(m)}
                        onRemove={() => setConfirmRemove(m)}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmRemove && (
        <ConfirmRemove
          member={confirmRemove}
          pending={pending}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => {
            const target = confirmRemove
            setConfirmRemove(null)
            run(removeMember(target.membershipId), `${target.name} removed`)
          }}
        />
      )}

      {inviteOpen && <InviteModal toast={toast} emailConfigured={emailConfigured} onClose={() => setInviteOpen(false)} onDone={() => router.refresh()} />}

      {manageLinksFor && (
        <SupportLinksModal
          support={manageLinksFor}
          producers={producers}
          links={producersForUser(manageLinksFor.userId)}
          toast={toast}
          onClose={() => setManageLinksFor(null)}
          onChanged={() => router.refresh()}
        />
      )}
    </div>
  )
}

function PendingInvites({
  invites, pending, run, emailConfigured,
}: {
  invites: PendingInvite[]
  pending: boolean
  run: (p: Promise<{ ok: true } | { error: string }>, success: string) => void
  emailConfigured: boolean
}) {
  const toast = useToast()
  const [busy, startBusy] = useTransition()

  // Rotate the token (invalidating the old link) and copy the fresh one. When a
  // provider is configured this also re-emails the invite, so message accordingly.
  const copyLink = (id: string) => {
    startBusy(async () => {
      const res = await refreshInviteLink(id)
      if ('error' in res) { toast.error(INVITE_ERRORS[res.error] ?? 'Could not generate a link.'); return }
      const ok = await copy(inviteLink(res.token))
      if (res.emailSent) {
        toast.success(ok ? 'Invite re-sent by email · fresh link copied' : 'Invite re-sent by email')
      } else {
        toast[ok ? 'success' : 'error'](ok ? 'Fresh invite link copied to clipboard' : 'Copy failed — try again')
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        Pending invitations ({invites.length})
      </div>
      <ul className="divide-y divide-border">
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{inv.name || inv.email}</p>
              <p className="truncate text-2xs text-muted-foreground">{inv.email} · <span className="capitalize">{inv.role}</span> · expires {fmtDate(inv.expiresAt)}</p>
            </div>
            <button
              onClick={() => copyLink(inv.id)}
              disabled={busy || pending}
              title={emailConfigured ? 'Rotate the link and re-send the invite email' : 'Rotate and copy a fresh invite link'}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-surface-1 hover:text-foreground disabled:opacity-50"
            >
              <Link2 className="h-3 w-3" /> {emailConfigured ? 'Resend' : 'Copy link'}
            </button>
            <button
              onClick={() => run(revokeInvitation(inv.id), 'Invitation revoked')}
              disabled={busy || pending}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-jubo-red hover:bg-surface-1 hover:text-jubo-red-dark disabled:opacity-50"
            >
              <X className="h-3 w-3" /> Revoke
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function InviteModal({
  toast, emailConfigured, onClose, onDone,
}: {
  toast: ReturnType<typeof useToast>
  emailConfigured: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<string>('member')
  const [link, setLink] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const to = email.trim()
    startTransition(async () => {
      const res = await inviteMember({ firstName: first, lastName: last, email, role })
      if ('error' in res) { toast.error(INVITE_ERRORS[res.error] ?? 'Could not create the invite.'); return }
      const l = inviteLink(res.token)
      setLink(l)
      setSent(res.emailSent)
      if (res.emailSent) {
        toast.success(`Invite email sent to ${to}`)
      } else {
        await copy(l)
        toast.success(emailConfigured ? 'Invite created — email didn’t send, link copied' : 'Invite created — link copied to clipboard')
      }
      onDone()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-jubo-navy/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Invite a teammate</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        {link ? (
          <div className="space-y-3">
            {sent ? (
              <p className="inline-flex items-start gap-1.5 text-xs text-jubo-green">
                <CircleCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="text-muted-foreground">Invite email sent. Here&apos;s the same single-use link as a backup — it expires in 7 days.</span>
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {emailConfigured ? 'The email didn’t send — copy this single-use link and send it manually. ' : 'Send this single-use link to your teammate. '}
                It expires in 7 days.
              </p>
            )}
            <div className="flex items-center gap-2">
              <code className="block flex-1 truncate rounded-md border border-border bg-surface-1 px-2 py-1.5 text-2xs text-foreground">{link}</code>
              <button onClick={async () => { const ok = await copy(link); toast[ok ? 'success' : 'error'](ok ? 'Copied' : 'Copy failed') }} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-2xs font-medium text-primary-foreground hover:bg-primary/90">
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <button onClick={onClose} className="w-full rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-surface-1">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name"><input value={first} onChange={(e) => setFirst(e.target.value)} className={inviteInput} placeholder="Jane" /></Field>
              <Field label="Last name"><input value={last} onChange={(e) => setLast(e.target.value)} className={inviteInput} placeholder="Smith" /></Field>
            </div>
            <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inviteInput} placeholder="teammate@company.com" /></Field>
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={inviteInput}>
                {INVITE_ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-1">Cancel</button>
              <button onClick={submit} disabled={pending || !email.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {pending ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const inviteInput = 'w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="text-xs font-medium text-muted-foreground">{label}</label>{children}</div>
}

function RowActions({
  member, currentRole, currentUserId, pending, onChangeRole, onSetStatus, onSetMemberType, onManageLinks, onRemove,
}: {
  member: TeamMember
  currentRole: string
  currentUserId: string
  pending: boolean
  onChangeRole: (role: string) => void
  onSetStatus: (status: 'active' | 'disabled') => void
  onSetMemberType: (type: 'producer' | 'support') => void
  onManageLinks: () => void
  onRemove: () => void
}) {
  const isSelf = member.userId === currentUserId
  const targetIsOwner = member.role === 'owner'
  // Mirror server rules so the UI only offers what will succeed.
  const canActOnOwner = currentRole === 'owner'
  const roleEditable = !targetIsOwner || canActOnOwner
  const canDisable = !isSelf && (!targetIsOwner || canActOnOwner)
  const canRemove = !isSelf && (!targetIsOwner || canActOnOwner)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${member.name}`}
        disabled={pending}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-1 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy disabled:opacity-50"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Shield className="h-3 w-3" /> Change role</span>
        </DropdownMenuLabel>
        {ASSIGNABLE_ROLES.map((r) => (
          <DropdownMenuItem
            key={r}
            disabled={!roleEditable || member.role === r}
            onSelect={() => onChangeRole(r)}
            className="cursor-pointer text-xs capitalize"
          >
            {r}{member.role === r && <span className="ml-auto text-2xs text-muted-foreground">current</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Network className="h-3 w-3" /> Member type</span>
        </DropdownMenuLabel>
        <DropdownMenuItem disabled={member.memberType === 'producer'} onSelect={() => onSetMemberType('producer')} className="cursor-pointer text-xs">
          <Briefcase className="mr-2 h-3.5 w-3.5" /> Producer
          {member.memberType === 'producer' && <span className="ml-auto text-2xs text-muted-foreground">current</span>}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={member.memberType === 'support'} onSelect={() => onSetMemberType('support')} className="cursor-pointer text-xs">
          <LifeBuoy className="mr-2 h-3.5 w-3.5" /> Support
          {member.memberType === 'support' && <span className="ml-auto text-2xs text-muted-foreground">current</span>}
        </DropdownMenuItem>
        {member.memberType === 'support' && (
          <DropdownMenuItem onSelect={() => onManageLinks()} className="cursor-pointer text-xs">
            <Network className="mr-2 h-3.5 w-3.5" /> Manage producers…
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {member.status === 'active' ? (
          <DropdownMenuItem disabled={!canDisable} onSelect={() => onSetStatus('disabled')} className="cursor-pointer text-xs">
            <Ban className="mr-2 h-3.5 w-3.5" /> Disable access
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => onSetStatus('active')} className="cursor-pointer text-xs">
            <CircleCheck className="mr-2 h-3.5 w-3.5" /> Re-enable access
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={!canRemove} onSelect={() => onRemove()} className="cursor-pointer text-xs text-jubo-red focus:text-jubo-red-dark">
          <UserMinus className="mr-2 h-3.5 w-3.5" /> Remove from org
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ConfirmRemove({ member, pending, onCancel, onConfirm }: { member: TeamMember; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-jubo-navy/50 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-semibold text-foreground">Remove {member.name}?</h2>
        <p className="mt-1.5 text-xs text-muted-foreground">
          They lose access to this workspace. Their account and everything they created stay intact. You can re-add them once
          invitations ship.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-1">Cancel</button>
          <button onClick={onConfirm} disabled={pending} className="rounded-lg bg-jubo-red px-3 py-1.5 text-xs font-medium text-white hover:bg-jubo-red-dark disabled:opacity-50">
            {pending ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const tone = role === 'owner' ? 'bg-jubo-navy/10 text-jubo-navy'
    : role === 'admin' ? 'bg-jubo-navy/10 text-jubo-navy'
    : 'bg-surface-2 text-muted-foreground'
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium capitalize ${tone}`}>{role}</span>
}

function MemberTypeBadge({ type }: { type: string }) {
  return type === 'support'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-jubo-green-soft px-2 py-0.5 text-2xs font-medium text-jubo-green"><LifeBuoy className="h-2.5 w-2.5" /> Support</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-jubo-navy/10 px-2 py-0.5 text-2xs font-medium text-jubo-navy"><Briefcase className="h-2.5 w-2.5" /> Producer</span>
}

function SupportLinksModal({
  support, producers, links, toast, onClose, onChanged,
}: {
  support: TeamMember
  producers: TeamMember[]
  links: SupportLink[]
  toast: ReturnType<typeof useToast>
  onClose: () => void
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const linkByProducer = new Map(links.map((l) => [l.producerUserId, l]))

  const toggle = (producer: TeamMember, existing: SupportLink | undefined) => {
    startTransition(async () => {
      const res = existing
        ? await unassignSupport(existing.id)
        : await assignSupportToProducer(support.userId, producer.userId)
      if ('error' in res) { toast.error(ERRORS[res.error] ?? 'Could not update the assignment.'); return }
      toast.success(existing ? `${support.name} no longer supports ${producer.name}` : `${support.name} now supports ${producer.name}`)
      onChanged()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-jubo-navy/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Producers {support.name} supports</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">Toggle the producers this support user helps. They can support as many as you like.</p>

        {producers.length === 0 ? (
          <p className="rounded-lg border border-border bg-surface-1 px-3 py-3 text-xs text-muted-foreground">
            No producers in this workspace yet. Mark someone as a producer first.
          </p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {producers.map((p) => {
              const existing = linkByProducer.get(p.userId)
              const on = !!existing
              return (
                <li key={p.userId}>
                  <button
                    onClick={() => toggle(p, existing)}
                    disabled={pending}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2 text-left text-xs hover:bg-surface-1 disabled:opacity-50"
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-jubo-navy bg-jubo-navy text-white' : 'border-border'}`}>
                      {on && <CircleCheck className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 text-foreground">{p.name}</span>
                    <span className="text-2xs text-muted-foreground">{on ? 'Supporting' : 'Assign'}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-surface-1">Done</button>
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return status === 'disabled'
    ? <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-muted-foreground"><Ban className="h-2.5 w-2.5" /> Disabled</span>
    : <span className="inline-flex items-center gap-1 rounded-full bg-jubo-green-soft px-2 py-0.5 text-2xs font-medium text-jubo-green"><CircleCheck className="h-2.5 w-2.5" /> Active</span>
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
