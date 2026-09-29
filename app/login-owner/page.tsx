'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
})

type LoginFormData = z.infer<typeof loginSchema>

function OwnerLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema) as any,
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false,
    },
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setError(null)

    const supabase = await createClient()

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (authError) {
      setError(authError.message)
      setIsLoading(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, org_id')
        .eq('id', user.id)
        .single()

      if (profile && (profile.role === 'org_admin' || profile.role === 'staff')) {
        const { data: org } = await supabase
          .from('organizations')
          .select('status')
          .eq('id', profile.org_id)
          .single()

        if (org?.status === 'approved') {
          router.push(callbackUrl)
          router.refresh()
          return
        } else if (org?.status === 'pending') {
          setError('Your organization is still pending verification. Please wait for approval.')
          await supabase.auth.signOut()
          setIsLoading(false)
          return
        } else if (org?.status === 'rejected') {
          setError('Your organization registration was rejected. Please contact support.')
          await supabase.auth.signOut()
          setIsLoading(false)
          return
        }
      }
    }

    setError('Access denied. This login is for organization owners and staff only.')
    await supabase.auth.signOut()
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold">
            ShiftGrid
          </Link>
          <h1 className="text-2xl font-semibold mt-6">Owner Login</h1>
          <p className="text-muted-foreground mt-2">
            Access your sports complex dashboard
          </p>
        </div>

        <div className="bg-background border rounded-lg p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                {error}
              </div>
            )}

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="owner@sportcity.tn"
                {...register('email')}
                error={!!errors.email}
                disabled={isLoading}
              />
              {errors.email && (
                <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
                error={!!errors.password}
                disabled={isLoading}
              />
              {errors.password && (
                <p className="text-sm text-destructive mt-1">{errors.password.message}</p>
              )}
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
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Don't have an organization yet?{' '}
              <Link href="/register?role=owner" className="text-primary hover:underline font-medium">
                Register your sports complex
              </Link>
            </p>
            <p className="mt-2">Are you a player?{' '}
              <Link href="/#discover" className="text-primary hover:underline font-medium">
                Book a court
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading...
        </div>
      }
    >
      <OwnerLoginContent />
    </Suspense>
  )
}
