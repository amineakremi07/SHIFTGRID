'use server'

import { AUTH_PATHS } from '@/lib/auth-urls'
import { requestOrigin } from '@/lib/notifications/origin'
import { loadProfile } from '@/lib/org-access'
import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { actionRateLimit } from '@/lib/rate-limit'
import { revalidatePath } from 'next/cache'
import { consentMetadata } from '@/lib/legal'
import {
  playerSignInSchema,
  playerSignUpSchema,
  playerRegisterSchema,
  anonymousBookerSchema,
  type PlayerSignUpInput,
  type PlayerRegisterInput,
  type AnonymousBookerInput,
} from '@/lib/validations/player-auth'

/**
 * Server actions for player authentication and anonymous booking
 * Callers: PlayerAuthModal component
 * Affected tables: profiles, anonymous_bookers, auth.users
 * Data schemas: playerSignInSchema, playerSignUpSchema, anonymousBookerSchema
 */

export async function signInPlayer(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  const supabase = await createClient()

  // Validate input
  const validation = playerSignInSchema.safeParse({ email, password, rememberMe })
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }

  // Sign in with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (authError) {
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: 'Authentication failed' }
  }

  // Get user profile to verify they're a player (not staff/owner). Read directly, not through the per-request
  // session cache: this request has just changed who is signed in.
  const profile = await loadProfile(supabase, authData.user.id)

  if (!profile) {
    // Sign out if no profile exists
    await supabase.auth.signOut()
    return { success: false, error: 'Account not found. Please contact support.' }
  }

  // Only allow player role (not org_admin or staff)
  if (profile.role !== 'player') {
    await supabase.auth.signOut()
    return { success: false, error: 'This account cannot sign in as a player.' }
  }

  return { success: true, userId: authData.user.id }
}

export async function signUpPlayer(
  data: PlayerSignUpInput
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  // Validate first, then use ONLY the validated output (trimmed, lower-cased, canonical phone, HTML stripped).
  const validation = playerSignUpSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }
  const input = validation.data

  const supabase = await createClient()
  const supabaseAdmin = getSupabaseAdmin()

  // Check if organization exists and is approved
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, status, deleted_at')
    .eq('id', input.orgId)
    .single()

  if (orgError || !org) {
    return { success: false, error: 'Invalid sports complex' }
  }

  if (org.status !== 'approved' || org.deleted_at !== null) {
    return { success: false, error: 'This sports complex is not yet available for bookings' }
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        full_name: input.displayName,
        phone: input.phone,
        ...consentMetadata(),
      },
      emailRedirectTo: `${await requestOrigin()}${AUTH_PATHS.callback}`, // must be on the Supabase Redirect URLs list (lib/auth-urls.ts)
    },
  })

  if (authError) {
    // Handle specific error cases
    if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
      return { success: false, error: 'An account with this email already exists' }
    }
    return { success: false, error: authError.message }
  }

  if (!authData.user) {
    return { success: false, error: 'Failed to create account' }
  }

  // With "confirm email" on, signing up an address that already has an account does not error: Supabase
  // returns a look-alike user with NO identities (and an id that is not a real account). Never create a
  // profile for it, and never delete anything on its behalf.
  if (authData.user.identities?.length === 0) {
    return { success: false, error: 'An account with this email already exists' }
  }

  // Create profile with player role
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      org_id: input.orgId,
      role: 'player',
      display_name: input.displayName,
      // NOTE: no `email` column on profiles — it lives on auth.users.
      phone: input.phone,
    })

  if (profileError) {
    // The user we just made (it has identities, so it is ours) must not be left without a profile.
    console.error('Profile creation failed:', profileError.message)
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: 'Failed to create player profile' }
  }

  revalidatePath('/dashboard')

  return { success: true, userId: authData.user.id }
}

export type RegisterPlayerResult =
  | {
      success: true
      /** The session is open (only when the project does not require email confirmation). */
      signedIn: boolean
      /** A confirmation link was emailed: the account works only after it is opened. */
      needsEmailConfirmation?: boolean
    }
  | { success: false; error: string }

/**
 * Register a player from `/register`: create the account and the `player` profile.
 *
 * The email address is NOT trusted until it is confirmed. The account used to be created already
 * confirmed, which let anyone register `victim@example.com` with their own password and wait for the
 * victim to arrive (a classic pre-account takeover, worse once "Continue with Google" can link to the
 * same address). Now Supabase emails a confirmation link (`/auth/callback`) and refuses to sign the
 * account in until it is opened; the dashboard setting "Confirm email" must stay ON.
 */
export async function registerPlayer(input: PlayerRegisterInput): Promise<RegisterPlayerResult> {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

  const parsed = playerRegisterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const { fullName, email, phone, password, orgId } = parsed.data

  const admin = getSupabaseAdmin()

  const { data: org } = await admin
    .from('organizations')
    .select('status, deleted_at')
    .eq('id', orgId)
    .maybeSingle()
  if (org?.status !== 'approved' || org.deleted_at !== null) {
    return { success: false, error: 'That club is not available for registration.' }
  }

  const supabase = await createClient()
  const { data: created, error: createError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone, ...consentMetadata() },
      emailRedirectTo: `${await requestOrigin()}${AUTH_PATHS.callback}`,
    },
  })

  const alreadyExists = 'An account with this email already exists. Try signing in instead.'
  if (createError || !created.user) {
    if (
      createError?.code === 'user_already_exists' ||
      createError?.code === 'email_exists' ||
      /already (been )?registered|already exists/i.test(createError?.message ?? '')
    ) {
      return { success: false, error: alreadyExists }
    }
    console.error('registerPlayer: could not create user:', createError?.message)
    return { success: false, error: 'We could not create your account. Please try again.' }
  }
  // An address that already has an account comes back as a look-alike user with no identities.
  if (created.user.identities?.length === 0) return { success: false, error: alreadyExists }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: orgId,
    role: 'player',
    display_name: fullName,
    phone,
  })

  if (profileError) {
    console.error('registerPlayer: could not create profile:', profileError.message)
    // No orphaned auth user without a profile (it has identities, so it is the one we just made).
    await admin.auth.admin.deleteUser(created.user.id)
    return { success: false, error: 'We could not create your player profile. Please try again.' }
  }

  revalidatePath('/')
  if (created.session) return { success: true, signedIn: true }
  return { success: true, signedIn: false, needsEmailConfirmation: true }
}

export async function createAnonymousBooker(
  data: AnonymousBookerInput
): Promise<{ success: boolean; bookerId?: string; error?: string }> {
  const limited = await actionRateLimit('booking')
  if (limited) return { success: false, error: limited }

  const supabaseAdmin = getSupabaseAdmin()

  // Validate input; from here on use only the validated output (phone is canonical +216XXXXXXXX).
  const validation = anonymousBookerSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }
  const input = validation.data

  // Check if organization exists and is approved
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, status, deleted_at')
    .eq('id', input.orgId)
    .single()

  if (orgError || !org) {
    return { success: false, error: 'Invalid sports complex' }
  }

  if (org.status !== 'approved' || org.deleted_at !== null) {
    return { success: false, error: 'This sports complex is not yet available for bookings' }
  }

  // Create the guest if new. An existing guest (same club + phone) is left exactly as it is: this endpoint
  // is anonymous, so letting it overwrite the stored name would let anyone who knows a number rename that guest.
  const { error: insertError } = await supabaseAdmin
    .from('anonymous_bookers')
    .upsert({ org_id: input.orgId, name: input.name, phone: input.phone }, { onConflict: 'org_id,phone', ignoreDuplicates: true })
  if (insertError) {
    console.error('Anonymous booker upsert failed:', insertError.message)
    return { success: false, error: 'Failed to create booking profile' }
  }

  const { data: booker } = await supabaseAdmin
    .from('anonymous_bookers')
    .select('id')
    .eq('org_id', input.orgId)
    .eq('phone', input.phone)
    .maybeSingle()
  if (!booker) return { success: false, error: 'Failed to create booking profile' }

  return { success: true, bookerId: booker.id }
}
