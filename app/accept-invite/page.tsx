'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Mail, Lock, User, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { acceptStaffInvite } from '@/lib/actions/staff-invites'

/**
 * Accept Invite Page - Unified signup/accept flow for staff invitations
 * Callers: Invitation email links (token-based navigation)
 * Affected API: POST /api/staff/invites/accept via acceptStaffInvite server action
 * Data schemas: signupSchema (email, password, confirmPassword, display_name)
 * User instruction: Build Staff Invite System - Accept Invite Page for token validation and user registration
 */
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  display_name: z.string().min(2, 'Display name must be at least 2 characters'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

type SignupFormData = z.infer<typeof signupSchema>

interface InviteData {
  email: string
  role: string
  organizationName?: string
}

export default function AcceptInvitePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [invite, setInvite] = useState<InviteData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    watch,
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  const password = watch('password')

  // Validate invite token on mount
  useEffect(() => {
    const validateInvite = async () => {
      if (!token) {
        setError('Invalid invitation link')
        setIsLoading(false)
        return
      }

      try {
        const result = await acceptStaffInvite(token)

        if (result.success && result.invite) {
          setInvite({
            email: result.invite.email,
            role: result.invite.role,
          })
          setValue('email', result.invite.email)
        } else {
          setError(result.error || 'Invalid or expired invitation')
        }
      } catch {
        setError('An unexpected error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    validateInvite()
  }, [token, setValue])

  const onSubmit = async (data: SignupFormData) => {
    if (!token) return

    setError(null)

    try {
      // For now, we use the acceptStaffInvite which handles both authenticated and non-authenticated users
      // If user needs to sign up, we'd redirect to signup with the token
      // For a complete implementation, we'd have a signup flow here

      // Since we're building the acceptance flow, we'll handle signup
      const supabase = await import('@/lib/supabase/client').then(m => m.createClient())

      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            display_name: data.display_name,
          },
        },
      })

      if (authError) {
        setError(authError.message)
        return
      }

      if (authData.user) {
        // Now accept the invite with the authenticated user
        const result = await acceptStaffInvite(token)

        if (result.success) {
          setSuccess(true)
          // Redirect to dashboard after short delay
          setTimeout(() => {
            router.push('/dashboard')
            router.refresh()
          }, 2000)
        } else {
          setError(result.error || 'Failed to accept invitation')
        }
      }
    } catch {
      setError('An unexpected error occurred')
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg text-muted-foreground">Validating invitation...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <CardTitle className="text-xl">Invalid Invitation</CardTitle>
            <CardDescription className="text-red-600">{error}</CardDescription>
            <div className="mt-6">
              <Link href="/login-owner" className="text-primary hover:underline">
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-xl">Welcome to ShiftGrid!</CardTitle>
            <CardDescription>
              Your account has been created and you've joined the organization as a{' '}
              <span className="font-medium capitalize">{invite?.role?.replace('_', ' ')}</span>.
            </CardDescription>
            <div className="mt-6 flex justify-center">
              <Button onClick={() => router.push('/dashboard')}>
                Go to Dashboard
              </Button>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Redirecting automatically...
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!invite) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">Accept Invitation</CardTitle>
          <CardDescription>
            You&apos;ve been invited to join as a <span className="font-medium capitalize">{invite.role.replace('_', ' ')}</span>.
            Create your account to get started.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                type="text"
                placeholder="John Doe"
                {...register('display_name')}
                disabled={isSubmitting}
              />
              {errors.display_name && (
                <p className="text-sm text-red-600">{errors.display_name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                disabled={isSubmitting || !!invite}
                className={invite ? 'bg-gray-50' : ''}
              />
              {invite && (
                <p className="text-xs text-muted-foreground">This email was used for the invitation</p>
              )}
              {errors.email && (
                <p className="text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...register('password')}
                  disabled={isSubmitting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0 h-8 w-8"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                {...register('confirmPassword')}
                disabled={isSubmitting}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting} size="lg">
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account & Join'
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href={`/login-owner?redirect=/accept-invite?token=${token}`} className="text-primary hover:underline font-medium">
                Sign in instead
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
    )
  }