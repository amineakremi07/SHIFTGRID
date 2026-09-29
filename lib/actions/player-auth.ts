'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import {
  playerSignInSchema,
  playerSignUpSchema,
  playerRegisterSchema,
  anonymousBookerSchema,
  type PlayerSignInInput,
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

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60

export async function signInPlayer(
  email: string,
  password: string,
  rememberMe: boolean
): Promise<{ success: boolean; userId?: string; error?: string }> {
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

  // Get user profile to verify they're a player (not staff/owner)
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, org_id')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile) {
    // Sign out if no profile exists
    await supabase.auth.signOut()
    return { success: false, error: 'Account not found. Please contact support.' }
  }

  // Only allow player role (not org_admin or staff)
  if (profile.role !== 'player') {
    await supabase.auth.signOut()
    return { success: false, error: 'This account cannot sign in as a player.' }
  }

  // If rememberMe, we need to set a long-lived session cookie
  // Supabase handles this via the session, but we can extend cookie lifetime
  // by updating the auth cookie options
  if (rememberMe && authData.session) {
    const cookieStore = await cookies()
    cookieStore.set('sb-auth-token', authData.session.access_token, {
      maxAge: THIRTY_DAYS_SECONDS,
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  }

  return { success: true, userId: authData.user.id }
}

export async function signUpPlayer(
  data: PlayerSignUpInput
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const supabase = await createClient()
  const supabaseAdmin = getSupabaseAdmin()

  // Validate input
  const validation = playerSignUpSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }

  // Check if organization exists and is approved
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, status')
    .eq('id', data.orgId)
    .single()

  if (orgError || !org) {
    return { success: false, error: 'Invalid sports complex' }
  }

  if (org.status !== 'approved') {
    return { success: false, error: 'This sports complex is not yet available for bookings' }
  }

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: {
        full_name: data.displayName,
        phone: data.phone,
      },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
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

  // Create profile with player role
  const { error: profileError } = await supabaseAdmin
    .from('profiles')
    .insert({
      id: authData.user.id,
      org_id: data.orgId,
      role: 'player',
      display_name: data.displayName,
      // NOTE: no `email` column on profiles — it lives on auth.users.
      phone: data.phone,
    })

  if (profileError) {
    // If profile creation fails, we should clean up the auth user
    // Note: In production, use a transaction or queue for cleanup
    console.error('Profile creation failed:', profileError)
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return { success: false, error: 'Failed to create player profile' }
  }

  // Send welcome email (optional - can be added later)
  // await sendWelcomeEmail(data.email, data.displayName)

  revalidatePath('/dashboard')

  return { success: true, userId: authData.user.id }
}

export type RegisterPlayerResult =
  | { success: true; /** False if the account exists but automatic sign-in failed. */ signedIn: boolean }
  | { success: false; error: string }

/**
 * Register a player from `/register`: create the account, the `player` profile,
 * and sign them in.
 *
 * The auth user is created already-confirmed (as owner signup does) so the
 * immediate sign-in works regardless of the project's email-confirmation
 * setting; there is also no `/auth/callback` route for confirmation links yet.
 * The trade-off is that the email is not verified. Add verification (with a real
 * callback route) before relying on the address.
 */
export async function registerPlayer(input: PlayerRegisterInput): Promise<RegisterPlayerResult> {
  const parsed = playerRegisterSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }
  const { fullName, email, phone, password, orgId } = parsed.data

  const admin = getSupabaseAdmin()

  const { data: org } = await admin
    .from('organizations')
    .select('status')
    .eq('id', orgId)
    .maybeSingle()
  if (org?.status !== 'approved') {
    return { success: false, error: 'That club is not available for registration.' }
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  })

  if (createError || !created.user) {
    if (
      createError?.code === 'email_exists' ||
      /already (been )?registered|already exists/i.test(createError?.message ?? '')
    ) {
      return { success: false, error: 'An account with this email already exists. Try signing in instead.' }
    }
    console.error('registerPlayer: could not create user:', createError?.message)
    return { success: false, error: 'We could not create your account. Please try again.' }
  }

  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    org_id: orgId,
    role: 'player',
    display_name: fullName,
    phone,
  })

  if (profileError) {
    console.error('registerPlayer: could not create profile:', profileError.message)
    // No orphaned auth user without a profile.
    await admin.auth.admin.deleteUser(created.user.id)
    return { success: false, error: 'We could not create your player profile. Please try again.' }
  }

  // Sets the session cookies (and re-checks that this is a player account).
  const signIn = await signInPlayer(email, password, true)
  revalidatePath('/')

  return { success: true, signedIn: signIn.success }
}

export async function createAnonymousBooker(
  data: AnonymousBookerInput
): Promise<{ success: boolean; bookerId?: string; error?: string }> {
  const supabaseAdmin = getSupabaseAdmin()

  // Validate input
  const validation = anonymousBookerSchema.safeParse(data)
  if (!validation.success) {
    return { success: false, error: validation.error.errors[0].message }
  }

  // Check if organization exists and is approved
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .select('id, status')
    .eq('id', data.orgId)
    .single()

  if (orgError || !org) {
    return { success: false, error: 'Invalid sports complex' }
  }

  if (org.status !== 'approved') {
    return { success: false, error: 'This sports complex is not yet available for bookings' }
  }

  // Normalize phone number for consistent lookup
  const normalizedPhone = data.phone.replace(/[\s\-\.\(\)]/g, '').replace(/^(\+216|00216)/, '')

  // Upsert anonymous booker (prevent duplicates by org_id + phone)
  const { data: booker, error: upsertError } = await supabaseAdmin
    .from('anonymous_bookers')
    .upsert(
      {
        org_id: data.orgId,
        name: data.name,
        phone: normalizedPhone,
      },
      {
        onConflict: 'org_id,phone',
        ignoreDuplicates: false,
      }
    )
    .select('id')
    .single()

  if (upsertError) {
    console.error('Anonymous booker upsert failed:', upsertError)
    return { success: false, error: 'Failed to create booking profile' }
  }

  return { success: true, bookerId: booker.id }
}