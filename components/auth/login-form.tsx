'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { z } from 'zod'

import { BrandMark } from '@/components/brand/brand-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { postLoginPath } from '@/lib/auth-landing'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from '@/components/auth/google-button'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
})
type LoginFormData = z.infer<typeof loginSchema>

export type LoginPortal = 'general' | 'business'

const COPY: Record<LoginPortal, { eyebrow?: string; title: string; placeholder: string }> = {
  general: {
    title: 'Log in',
    placeholder: 'you@example.com',
  },
  business: {
    eyebrow: 'ShiftGrid Business',
    title: 'Club Management Login',
    placeholder: 'owner@sportcity.tn',
  },
}

function LoginFormContent({ portal }: { portal: LoginPortal }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The route guards send `?redirect=`; older links used `?callbackUrl=` / `?next=`.
  // postLoginPath() only follows same-site paths the signed-in role can open.
  const requested = searchParams.get('redirect') ?? searchParams.get('callbackUrl') ?? searchParams.get('next')
  const copy = COPY[portal]
  const passwordWasReset = searchParams.get('reset') === '1'
  // /auth/callback sends a bad, expired or already used email link here.
  const linkProblem = searchParams.get('error') === 'link_invalid'
  // Google sign-in found no account and no club to join (the button on a club page knows the club).
  const googleNoClub = searchParams.get('error') === 'google_no_club'

  const [error, setError] = useState<React.ReactNode>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof loginSchema>, unknown, LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)
    const supabase = createClient()

    const fail = async (message: React.ReactNode) => {
      await supabase.auth.signOut()
      setError(message)
      setIsLoading(false)
    }

    const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })
    if (authError || !auth.user) {
      setError(authError?.message ?? 'Sign in failed. Please try again.')
      setIsLoading(false)
      return
    }

    const { data: profile } = await supabase.from('profiles').select('role, org_id').eq('id', auth.user.id).maybeSingle()
    if (!profile) return fail('We could not find a ShiftGrid profile for this account. Please contact support.')

    // Club managers need an approved club; a pending or rejected one has nothing to manage yet.
    if (profile.role === 'org_admin' || profile.role === 'staff') {
      const { data: org } = await supabase.from('organizations').select('status, deleted_at').eq('id', profile.org_id).maybeSingle()
      if (org?.deleted_at) return fail('This club has been closed. Please contact support.')
      if (org?.status === 'pending') return fail('Your organization is still pending verification. Please wait for approval.')
      if (org?.status === 'rejected') return fail('Your organization registration was rejected. Please contact support.')
      if (org?.status !== 'approved') return fail('Your organization is not active. Please contact support.')
    }

    if (portal === 'business' && profile.role === 'player') {
      return fail(
        <>
          This portal is reserved for club management. Please log in via the{' '}
          <Link href="/login" className="font-medium underline underline-offset-2">
            main login page
          </Link>
          .
        </>
      )
    }

    router.push(postLoginPath(profile.role, requested))
    router.refresh()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandMark tone="dark" imageClassName="h-12" />
          {copy.eyebrow && (
            <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{copy.eyebrow}</p>
          )}
          <h1 className={`text-2xl font-semibold ${copy.eyebrow ? 'mt-1' : 'mt-6'}`}>{copy.title}</h1>
          <p className="text-muted-foreground mt-2">Welcome back! Please enter your details.</p>
        </div>

        <div className="bg-background border rounded-lg p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {linkProblem && !error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="link-invalid">
                That email link is invalid, has expired or was already used. Sign in below, or ask for a new link (a new invitation from the club owner, or{' '}
                <Link href="/forgot-password" className="font-medium underline underline-offset-2">
                  a password reset
                </Link>
                ).
              </div>
            )}
            {googleNoClub && !error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive" data-testid="google-no-club">
                No ShiftGrid account uses that Google address yet. Open a club page and tap <strong>Continue with Google</strong> there to join that club, or{' '}
                <Link href="/register" className="font-medium underline underline-offset-2">
                  create an account
                </Link>
                .
              </div>
            )}
            {passwordWasReset && !error && (
              <div role="status" className="rounded-md border border-[#0e634f]/30 bg-[#0e634f]/10 p-3 text-sm text-[#0e634f]">
                Your password was updated. Please sign in with your new password.
              </div>
            )}
            {error && (
              <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={copy.placeholder}
                {...register('email')}
                error={!!errors.email}
                disabled={isLoading}
              />
              {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                error={!!errors.password}
                disabled={isLoading}
              />
              {errors.password && <p className="text-sm text-destructive mt-1">{errors.password.message}</p>}
              <p className="mt-2 text-right">
                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  Forgot password?
                </Link>
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="rememberMe"
                {...register('rememberMe')}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                disabled={isLoading}
              />
              <Label htmlFor="rememberMe" className="ml-2 text-sm cursor-pointer">
                Remember me for 30 days
              </Label>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Signing in" /> : 'Sign In'}
            </Button>
          </form>

          {portal === 'general' && (
            <div className="mt-5 space-y-3">
              <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                or
              </p>
              <GoogleButton next={requested ?? undefined} disabled={isLoading} />
              <p className="text-center text-xs text-muted-foreground">
                By continuing you accept the{' '}
                <Link href="/terms" className="underline underline-offset-2">Terms</Link> and{' '}
                <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
              </p>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {portal === 'general' ? (
              <>
                <p>
                  New here?{' '}
                  <Link href="/register" className="text-primary hover:underline font-medium">
                    Create an account
                  </Link>
                </p>
                <p className="mt-2">
                  Run a club?{' '}
                  <Link href="/login-owner" className="text-primary hover:underline font-medium">
                    Club management login
                  </Link>
                </p>
              </>
            ) : (
              <>
                <p>
                  Don&apos;t have an organization yet?{' '}
                  <Link href="/register?role=owner" className="text-primary hover:underline font-medium">
                    Register your sports complex
                  </Link>
                </p>
                <p className="mt-2">
                  Are you a player?{' '}
                  <Link href="/login" className="text-primary hover:underline font-medium">
                    Log in here
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** `useSearchParams()` needs a Suspense boundary or the production build fails at prerender. */
export function LoginForm({ portal }: { portal: LoginPortal }) {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading...</div>}>
      <LoginFormContent portal={portal} />
    </Suspense>
  )
}
