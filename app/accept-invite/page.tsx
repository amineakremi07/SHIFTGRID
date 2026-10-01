'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { acceptStaffInvite, previewStaffInvite, type InvitePreview } from '@/lib/actions/staff-invites'
import { createClient } from '@/lib/supabase/client'

/**
 * Staff invitation landing page. The emailed token proves the invitee owns the
 * address, so they only choose a name and a password; the server creates the
 * account (role `staff`, in the inviting club) and we then sign them in.
 */
function AcceptInviteContent() {
  const router = useRouter()
  const token = useSearchParams().get('token') ?? ''

  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    previewStaffInvite(token).then((result) => {
      if (!cancelled) setPreview(result)
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (name.trim().length < 2) return setError('Please enter your name')
    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setSubmitting(true)
    const result = await acceptStaffInvite({ token, displayName: name, password })
    if (!result.ok) {
      setError(result.message)
      setSubmitting(false)
      return
    }

    // Account exists now; sign in and go to work.
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: result.email,
      password,
    })
    if (signInError) {
      router.push('/login-owner')
      return
    }
    router.push('/dashboard/org/bookings')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f5f2] px-4 py-10 text-[#2a1a1d]">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link href="/" className="text-2xl font-semibold tracking-tight">
            ShiftGrid
          </Link>
        </div>

        {preview === null ? (
          <div role="status" className="flex items-center justify-center gap-2 rounded-xl bg-[#eae6df] py-12 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your invitation
          </div>
        ) : !preview.ok ? (
          <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center">
            <AlertCircle className="mx-auto mb-3 size-8 text-destructive" aria-hidden />
            <p className="font-semibold">Invitation unavailable</p>
            <p className="mt-1 text-sm text-[#645757]">{preview.message}</p>
            <Link href="/login-owner" className="mt-4 inline-block text-sm underline-offset-4 hover:underline">
              Go to login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 rounded-xl bg-[#eae6df] p-6">
            <div>
              <h1 className="text-xl font-semibold">Join {preview.clubName}</h1>
              <p className="mt-1 text-sm text-[#645757]">
                You were invited as staff. Choose a name and a password for <strong>{preview.email}</strong>.
              </p>
            </div>

            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" disabled={submitting} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>

            <Button type="submit" disabled={submitting} className="h-10 w-full bg-[#1d3023] text-[#f7f5f2] hover:bg-[#1d3023]/90">
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              Create account and join
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteContent />
    </Suspense>
  )
}
