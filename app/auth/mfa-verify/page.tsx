import { redirect } from 'next/navigation'

import { AuthCard } from '@/components/auth/auth-card'
import { MfaVerifyForm } from '@/components/auth/mfa-verify-form'
import { landingPathFor } from '@/lib/auth-landing'
import { hasVerifiedFactor } from '@/lib/mfa'
import { safeRedirectPath } from '@/lib/safe-redirect'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/types/database'

export const metadata = { title: 'Two-factor verification', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Sign-in step 2. The proxy sends a signed-in user here when their account has an authenticator but this
 * session has not used it yet (`aal1`). The destination is the page they were heading for, re-validated
 * as a same-site path; a visitor who does not need a code is passed straight on.
 */
export default async function MfaVerifyPage({ searchParams }: { searchParams: Promise<{ redirect?: string }> }) {
  const { redirect: wanted } = await searchParams
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login-owner')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const destination = safeRedirectPath(wanted) ?? landingPathFor(profile?.role as UserRole | undefined)

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  const factor = user.factors?.find((f) => f.factor_type === 'totp' && f.status === 'verified')
  if (!hasVerifiedFactor(user.factors) || !factor || aal?.currentLevel === 'aal2') redirect(destination)

  return (
    <AuthCard title="Two-factor verification" subtitle="Enter the 6-digit code from your authenticator app to continue.">
      <MfaVerifyForm factorId={factor.id} destination={destination} />
    </AuthCard>
  )
}
