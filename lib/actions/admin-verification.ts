'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { z } from 'zod'

import { requireAdmin } from '@/lib/admin/access'
import { documentRef } from '@/lib/admin/verification'
import { sendOrgDecisionEmail } from '@/lib/email/org-decision'
import { notifyCancellation } from '@/lib/notifications/service'
import { reportServerError } from '@/lib/observability'
import { captureAudit } from '@/lib/telemetry'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import type { OrgStatus } from '@/lib/types/database'

/**
 * Platform-admin decisions on club registrations.
 *
 * All of this uses the service-role client (RLS does not protect it), so every
 * action begins with requireAdmin(), which reads the verified session.
 */

const uuid = z.string().uuid()
const SIGNED_URL_SECONDS = 300

export type DecisionResult =
  | { ok: true; emailSent: boolean }
  | { ok: false; message: string }

export type DocumentResult =
  | { ok: true; url: string; kind: 'pdf' | 'image' | 'other'; name: string | null }
  | { ok: false; message: string }

function refreshPages() {
  revalidatePath('/admin/verification')
  // The public discovery page and club list show approved clubs only.
  revalidatePath('/')
  revalidatePath('/courts')
}

/** Owner of an org (its org_admin profile) and their auth email. */
async function findOwner(orgId: string) {
  const admin = getSupabaseAdmin()
  const { data: profile } = await admin
    .from('profiles')
    .select('id, display_name')
    .eq('org_id', orgId)
    .eq('role', 'org_admin')
    .limit(1)
    .maybeSingle()
  if (!profile) return null
  const { data } = await admin.auth.admin.getUserById(profile.id)
  return data.user?.email ? { name: profile.display_name, email: data.user.email } : null
}

async function decide(
  orgId: string,
  decision: 'approved' | 'rejected',
  reason?: string
): Promise<DecisionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!uuid.safeParse(orgId).success) return { ok: false, message: 'Invalid organization.' }

  const admin = getSupabaseAdmin()
  // Approving may also reverse an earlier rejection; rejecting only applies to
  // clubs still waiting. The status filter makes a stale double-click a no-op.
  const from: OrgStatus[] = decision === 'approved' ? ['pending', 'rejected'] : ['pending']

  const { data, error } = await admin
    .from('organizations')
    .update({
      status: decision,
      verified_at: new Date().toISOString(),
      verified_by: auth.userId,
      rejection_reason: decision === 'rejected' ? (reason ?? null) : null,
    })
    .eq('id', orgId)
    .in('status', from)
    .select('id, name')

  if (error) {
    console.error('decide failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not save the decision. Please try again.' }
  }
  const org = data?.[0]
  if (!org) {
    refreshPages()
    return { ok: false, message: 'This organization was already reviewed. The list has been refreshed.' }
  }

  captureAudit({ action: `organization.${decision === 'approved' ? 'approve' : 'reject'}`, status: decision, org_id: orgId, actor: 'platform_admin' })
  const owner = await findOwner(orgId)
  const emailed = owner
    ? await sendOrgDecisionEmail({
        to: owner.email,
        ownerName: owner.name,
        clubName: org.name,
        decision,
        reason,
      })
    : { sent: false }

  refreshPages()
  return { ok: true, emailSent: emailed.sent }
}

export async function approveOrganization(orgId: string): Promise<DecisionResult> {
  return decide(orgId, 'approved')
}

const reasonSchema = z
  .string()
  .trim()
  .min(10, 'Please give a reason of at least 10 characters.')
  .max(1000, 'The reason is too long (1000 characters max).')

export async function rejectOrganization(orgId: string, reason: string): Promise<DecisionResult> {
  const parsed = reasonSchema.safeParse(reason)
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message }
  return decide(orgId, 'rejected', parsed.data)
}

/** A short-lived signed URL for the registration proof. The bucket is private. */
export async function getVerificationDocument(orgId: string): Promise<DocumentResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!uuid.safeParse(orgId).success) return { ok: false, message: 'Invalid organization.' }

  const admin = getSupabaseAdmin()
  const { data: org } = await admin
    .from('organizations')
    .select('verification_documents')
    .eq('id', orgId)
    .maybeSingle()

  const ref = documentRef(org?.verification_documents)
  const name = ref.path ?? ref.legacyUrl ?? null
  if (!ref.path && !ref.legacyUrl) return { ok: false, message: 'No document was uploaded for this club.' }

  let url = ref.legacyUrl
  if (ref.path) {
    const { data, error } = await admin.storage
      .from('verification-docs')
      .createSignedUrl(ref.path, SIGNED_URL_SECONDS)
    if (error || !data) {
      console.error('createSignedUrl failed', { message: error?.message })
      return { ok: false, message: 'Could not open the document. It may have been removed.' }
    }
    url = data.signedUrl
  }

  const ext = (ref.path ?? ref.legacyUrl ?? '').split('?')[0].split('.').pop()?.toLowerCase()
  const kind = ext === 'pdf' ? 'pdf' : ext && ['jpg', 'jpeg', 'png'].includes(ext) ? 'image' : 'other'
  return { ok: true, url: url!, kind, name }
}

/* -------------------------------------------------------------------------------------------
   Archiving a club (soft delete). The platform admin's only way to take a club down: a flag,
   never a DELETE (the database blocks hard deletes of anything with booking history anyway).
   ---------------------------------------------------------------------------------------- */

export type ArchiveResult =
  | { ok: true }
  | { ok: false; message: string; /** The club still has this many upcoming bookings: ask before cancelling them. */ upcoming?: number }

/**
 * Hide a club everywhere and close its dashboard and API keys, keeping every booking, payment and court.
 * With upcoming open bookings it refuses until the admin confirms (`cancelUpcoming`), then cancels them
 * (the slot locks are freed, refunds recorded) and emails each player.
 */
export async function archiveOrganizationAction(orgId: string, cancelUpcoming = false): Promise<ArchiveResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!uuid.safeParse(orgId).success) return { ok: false, message: 'Invalid organization.' }

  const { data, error } = await getSupabaseAdmin().rpc('archive_organization', {
    p_org_id: orgId,
    p_cancel_upcoming: cancelUpcoming,
  })
  if (error) {
    const upcoming = error.message.match(/has_upcoming_bookings:(\d+)/)
    if (upcoming) return { ok: false, message: 'This club has upcoming bookings.', upcoming: Number(upcoming[1]) }
    if (error.message.includes('org_not_found')) {
      refreshPages()
      return { ok: false, message: 'This club is already archived or no longer exists.' }
    }
    console.error('archiveOrganization failed', { code: error.code, message: error.message })
    reportServerError('admin.archive-org', new Error(`archive_organization failed: ${error.code ?? 'unknown'}`), { code: error.code ?? null })
    return { ok: false, message: 'Could not archive the club. Please try again.' }
  }

  captureAudit({
    action: 'organization.archive',
    status: 'archived',
    org_id: orgId,
    actor: 'platform_admin',
    detail: cancelUpcoming ? 'upcoming_bookings_cancelled' : undefined,
  })
  // The players whose bookings were cancelled hear about it after the response.
  const ids = ((data as { cancelled_booking_ids?: string[] } | null)?.cancelled_booking_ids ?? []).filter((id) => uuid.safeParse(id).success)
  if (ids.length) {
    after(async () => {
      for (const bookingId of ids) await notifyCancellation({ bookingId, by: 'club' })
    })
  }

  refreshPages()
  revalidatePath(`/courts/${orgId}`)
  return { ok: true }
}

export async function restoreOrganizationAction(orgId: string): Promise<ArchiveResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth
  if (!uuid.safeParse(orgId).success) return { ok: false, message: 'Invalid organization.' }

  const { error } = await getSupabaseAdmin().rpc('restore_organization', { p_org_id: orgId })
  if (error) {
    if (error.message.includes('org_not_found')) {
      refreshPages()
      return { ok: false, message: 'This club is not archived.' }
    }
    console.error('restoreOrganization failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not restore the club. Please try again.' }
  }

  captureAudit({ action: 'organization.restore', status: 'restored', org_id: orgId, actor: 'platform_admin' })

  refreshPages()
  revalidatePath(`/courts/${orgId}`)
  return { ok: true }
}
