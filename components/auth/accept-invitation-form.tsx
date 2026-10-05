'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { AuthCard } from '@/components/auth/auth-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { completeInvitationAction } from '@/lib/actions/staff-invites'
import { createClient } from '@/lib/supabase/client'
import { newPasswordSchema } from '@/lib/validations/password-reset'

/**
 * Step two of an invitation that arrived through Supabase Auth: the invitee is already signed in (the
 * link was verified), so they only choose a name and a password. The club is decided on the server.
 */
export function AcceptInvitationForm({ clubName, email }: { clubName: string; email: string }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (name.trim().length < 2) return setError('Please enter your name')
    const parsed = newPasswordSchema.safeParse({ password, confirmPassword: confirm })
    if (!parsed.success) return setError(parsed.error.issues[0].message)

    setError(null)
    setBusy(true)
    const result = await completeInvitationAction({ displayName: name, password })
    if (!result.ok) {
      setBusy(false)
      return setError(result.message)
    }
    // Choosing a password ends the session the invitation link opened, so sign in again with it
    // (same as the emailed-token flow on /accept-invite).
    const { error: signInError } = await createClient().auth.signInWithPassword({ email, password })
    if (signInError) {
      router.push('/login-owner')
      return
    }
    router.push('/dashboard/org/bookings')
    router.refresh()
  }

  return (
    <AuthCard title={`Join ${clubName}`} subtitle={`You were invited as staff. Choose a name and a password for ${email}.`}>
      <form onSubmit={submit} noValidate className="space-y-4" data-testid="accept-invitation-form">
        {error && (
          <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div>
          <Label htmlFor="ai-name">Your name</Label>
          <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={busy} autoFocus />
        </div>
        <div>
          <Label htmlFor="ai-password">Password</Label>
          <Input id="ai-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} />
        </div>
        <div>
          <Label htmlFor="ai-confirm">Confirm password</Label>
          <Input id="ai-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" disabled={busy} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" /> : 'Create account and join'}
        </Button>
      </form>
    </AuthCard>
  )
}
