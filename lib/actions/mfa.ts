'use server'

import { z } from 'zod'

import { hasVerifiedFactor, normaliseTotp } from '@/lib/mfa'
import { actionRateLimit } from '@/lib/rate-limit'
import { captureAudit } from '@/lib/telemetry'
import { createClient } from '@/lib/supabase/server'

/**
 * Two-factor authentication (TOTP) for the signed-in account. Every action works on the verified
 * session user (`getUser`), never on an id from the browser; a factor id from the browser is only
 * ever used together with that session, and Supabase refuses a factor that is not the caller's.
 */

export type MfaFactor = { id: string; friendlyName: string | null; createdAt: string }

export type MfaStatus =
  | { ok: true; signedIn: true; enrolled: boolean; factors: MfaFactor[]; currentLevel: string | null; nextLevel: string | null; needsVerification: boolean }
  | { ok: true; signedIn: false }
  | { ok: false; message: string }

/** Where this account stands: has it enrolled an authenticator, and has this session used it? */
export async function checkMFAStatus(): Promise<MfaStatus> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: true, signedIn: false }

  const { data: aal, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) return { ok: false, message: 'Could not read your security status.' }

  // `user.factors` came from the auth server (getUser), unlike the copy in the session cookie.
  const verified = (user.factors ?? []).filter((f) => f.factor_type === 'totp' && f.status === 'verified')
  return {
    ok: true,
    signedIn: true,
    enrolled: hasVerifiedFactor(user.factors),
    factors: verified.map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at })),
    currentLevel: aal.currentLevel,
    nextLevel: aal.nextLevel,
    needsVerification: hasVerifiedFactor(user.factors) && aal.currentLevel !== 'aal2',
  }
}

export type EnrollResult =
  | { ok: true; factorId: string; /** otpauth:// URI: the QR code is drawn from it in the browser. */ uri: string; secret: string }
  | { ok: false; message: string }

/** Start enrolling an authenticator app. Nothing protects the account until `verifyMFA` confirms a code. */
export async function enrollMFA(): Promise<EnrollResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const limited = await actionRateLimit('auth', user.id)
  if (limited) return { ok: false, message: limited }

  // A half-finished earlier attempt blocks a new one ("factor already exists"): drop unverified factors.
  for (const factor of user.factors ?? []) {
    if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    issuer: 'ShiftGrid',
  })
  if (error || !data) {
    console.error('mfa enroll failed', error?.message)
    return { ok: false, message: 'Could not start two-factor setup. Please try again.' }
  }
  return { ok: true, factorId: data.id, uri: data.totp.uri, secret: data.totp.secret }
}

export type VerifyResult = { ok: true } | { ok: false; message: string }

const factorIdSchema = z.string().uuid()

/**
 * Prove possession of the authenticator: challenge, then verify the 6-digit code. For a new factor this
 * confirms the enrollment; for an enrolled one it upgrades the session to aal2 (the session cookies are
 * refreshed here, so the very next request is already aal2).
 */
export async function verifyMFA(factorId: string, code: string): Promise<VerifyResult> {
  const id = factorIdSchema.safeParse(factorId)
  const digits = normaliseTotp(code)
  if (!id.success || !digits) return { ok: false, message: 'Enter the 6-digit code from your authenticator app.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  // Six digits can be guessed: count attempts per account.
  const limited = await actionRateLimit('auth', user.id)
  if (limited) return { ok: false, message: limited }

  const challenge = await supabase.auth.mfa.challenge({ factorId: id.data })
  if (challenge.error || !challenge.data) return { ok: false, message: 'Could not check that code. Please try again.' }

  const { error } = await supabase.auth.mfa.verify({ factorId: id.data, challengeId: challenge.data.id, code: digits })
  if (error) return { ok: false, message: 'That code is not right or has expired. Wait for the next one and try again.' }

  captureAudit({ action: 'mfa.verify', status: 'verified' })
  return { ok: true }
}

/** Remove an authenticator. Supabase only allows it from an aal2 session, so a stolen password cannot do it. */
export async function disableMFA(factorId: string): Promise<VerifyResult> {
  const id = factorIdSchema.safeParse(factorId)
  if (!id.success) return { ok: false, message: 'Invalid authenticator.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Please sign in again.' }

  const { error } = await supabase.auth.mfa.unenroll({ factorId: id.data })
  if (error) return { ok: false, message: 'Could not remove it. Confirm a code from the authenticator first, then try again.' }

  captureAudit({ action: 'mfa.disable', status: 'removed' })
  return { ok: true }
}
