'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2, Mail, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  inviteStaff,
  removeStaffMember,
  resendStaffInvite,
  revokeStaffInvite,
  type InviteActionResult,
} from '@/lib/actions/staff-invites'
import { formatVenueDate, venueDateString } from '@/lib/court-time'
import type { PendingInvite, StaffMember } from '@/lib/staff-overview'

const day = (iso: string) => formatVenueDate(venueDateString(new Date(iso)))

export function StaffManager({ staff, invites }: { staff: StaffMember[]; invites: PendingInvite[] }) {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [emailError, setEmailError] = React.useState<string | null>(null)
  const [inviting, setInviting] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  // The link of the last invite/resend. Shown once: it is never listed afterwards.
  const [link, setLink] = React.useState<{ url: string; emailSent: boolean; to: string } | null>(null)
  const [toRemove, setToRemove] = React.useState<StaffMember | null>(null)
  const [removing, setRemoving] = React.useState(false)

  const handled = (result: InviteActionResult, to: string) => {
    if (!result.ok) {
      toast.error(result.message)
      return false
    }
    setLink({ url: result.inviteUrl, emailSent: result.emailSent, to })
    toast.success(result.emailSent ? `Invitation emailed to ${to}` : 'Invitation created. Share the link below.')
    router.refresh()
    return true
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setEmailError('Enter a valid email address')
      return
    }
    setInviting(true)
    const result = await inviteStaff({ email })
    setInviting(false)
    if (!result.ok) {
      setEmailError(result.message)
      return
    }
    handled(result, email.trim().toLowerCase())
    setEmail('')
  }

  const resend = async (invite: PendingInvite) => {
    setBusyId(invite.id)
    const result = await resendStaffInvite(invite.id)
    setBusyId(null)
    handled(result, invite.email)
  }

  const revoke = async (invite: PendingInvite) => {
    setBusyId(invite.id)
    const result = await revokeStaffInvite(invite.id)
    setBusyId(null)
    if (!result.ok) return void toast.error(result.message)
    toast.success('Invitation revoked')
    router.refresh()
  }

  const confirmRemove = async () => {
    if (!toRemove) return
    setRemoving(true)
    const result = await removeStaffMember(toRemove.id)
    setRemoving(false)
    if (!result.ok) return void toast.error(result.message)
    toast.success(`${toRemove.name} no longer has access`)
    setToRemove(null)
    router.refresh()
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Team</h2>
        <p className="text-sm text-[#645757]">
          Staff can manage bookings, walk-ins and cancellations. They cannot change courts, prices, opening hours or the
          team.
        </p>
      </div>

      <form onSubmit={submit} noValidate className="rounded-xl bg-[#eae6df] p-5">
        <Label htmlFor="staff-email">Invite a staff member</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            id="staff-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={Boolean(emailError)}
            className="min-w-64 flex-1"
            disabled={inviting}
          />
          <Button type="submit" disabled={inviting} className="h-10 bg-[#1d3023] px-4 text-[#f7f5f2] hover:bg-[#1d3023]/90">
            {inviting ? <Loader2 className="animate-spin" aria-hidden /> : <UserPlus aria-hidden />}
            Send invitation
          </Button>
        </div>
        {emailError && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {emailError}
          </p>
        )}
        <p className="mt-2 text-xs text-[#645757]">
          They get a link valid for 7 days to set their name and password. Use an address that has no ShiftGrid account
          yet.
        </p>
      </form>

      {link && (
        <div role="status" className="rounded-xl border border-[#1d3023]/30 bg-[#f7f5f2] p-5 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <Mail className="size-4" aria-hidden />
            {link.emailSent
              ? `We emailed ${link.to}. You can also share this link:`
              : `The email could not be sent. Share this link with ${link.to} yourself:`}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              readOnly
              value={link.url}
              aria-label="Invitation link"
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-64 flex-1 rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => copy(link.url)}>
              <Copy aria-hidden /> Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-[#645757]">This link is shown only now. To get a new one, use Resend.</p>
        </div>
      )}

      <section aria-labelledby="active-staff" className="space-y-3">
        <h3 id="active-staff" className="text-lg font-semibold">
          Active staff ({staff.length})
        </h3>
        {staff.length === 0 ? (
          <p className="rounded-xl bg-[#eae6df] px-5 py-6 text-sm text-[#645757]">No staff yet.</p>
        ) : (
          <ul className="divide-y divide-[#d7d2cc] rounded-xl bg-[#eae6df]">
            {staff.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="truncate text-sm text-[#645757]">
                    {m.email ?? 'No email'} · joined {day(m.joinedAt)}
                  </p>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setToRemove(m)}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pending-invites" className="space-y-3">
        <h3 id="pending-invites" className="text-lg font-semibold">
          Pending invitations ({invites.length})
        </h3>
        {invites.length === 0 ? (
          <p className="rounded-xl bg-[#eae6df] px-5 py-6 text-sm text-[#645757]">No pending invitations.</p>
        ) : (
          <ul className="divide-y divide-[#d7d2cc] rounded-xl bg-[#eae6df]">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium">{i.email}</span>
                    <Badge variant={i.expired ? 'destructive' : 'warning'}>{i.expired ? 'Expired' : 'Pending'}</Badge>
                  </p>
                  <p className="text-sm text-[#645757]">
                    {i.expired ? 'Expired' : 'Expires'} {day(i.expiresAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={busyId === i.id} onClick={() => resend(i)}>
                    {busyId === i.id ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
                    Resend
                  </Button>
                  <Button variant="destructive" size="sm" disabled={busyId === i.id} onClick={() => revoke(i)}>
                    Revoke
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={toRemove !== null} onOpenChange={(o) => !removing && !o && setToRemove(null)}>
        <DialogContent className="bg-[#eae6df] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove {toRemove?.name}?</DialogTitle>
            <DialogDescription>
              Their login is deleted and they lose access to the dashboard immediately. Bookings they handled are not
              affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setToRemove(null)} disabled={removing}>
              Keep
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={removing}>
              {removing && <Loader2 className="animate-spin" aria-hidden />}
              Remove access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
