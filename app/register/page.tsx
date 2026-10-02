import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'

import { RegisterFlow, type RegisterRole } from '@/components/auth/register-flow'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'

export const metadata: Metadata = {
  title: 'Join ShiftGrid',
  description: 'Create a player account to book courts, or register your sports club.',
}

// Reads the session and the live club list, so never prerendered.
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ role?: string; club?: string; next?: string }>
}) {
  const params = (await searchParams) ?? {}
  const next = safeRedirectPath(params.next)

  // Someone who is already signed in has nothing to register.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect(next ?? '/')

  const initialRole: RegisterRole | null =
    params.role === 'player' || params.role === 'owner' ? params.role : null
  const initialClubId = params.club && UUID.test(params.club) ? params.club : null

  // Clubs a player can join: approved ones, via the public (anon) client.
  const { data: clubRows, error } = await createPublicClient()
    .from('organizations')
    .select('id, name, city')
    .eq('status', 'approved')
    .order('name')
    .limit(200)
  if (error) console.error('Failed to load clubs for registration:', error.message, error.details)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-[1920px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-12">
          <Link href="/" className="font-heading text-xl font-semibold tracking-tight">
            ShiftGrid
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Already registered? Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="mx-auto w-full max-w-4xl">
        <RegisterFlow
          clubs={clubRows ?? []}
          initialRole={initialRole}
          initialClubId={initialClubId}
          next={next}
        />
        </div>
      </main>
    </div>
  )
}
