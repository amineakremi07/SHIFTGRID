'use server'

import { revalidatePath } from 'next/cache'

import { requireOrgAction } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { createClient } from '@/lib/supabase/server'
import { courtFormSchema, type CourtFormInput } from '@/lib/validations/court'

export type CourtActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> }

/**
 * Court writes go through the caller's own session (not the service role), so
 * the `courts` RLS policies (org_admin of the same org) are a second lock behind
 * requireOrgAction.
 */
export async function saveCourt(courtId: string | null, input: CourtFormInput): Promise<CourtActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth

  const parsed = courtFormSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please fix the highlighted fields.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  const v = parsed.data
  const supabase = await createClient()

  const fields = {
    name: v.name,
    sport: v.sport,
    price_per_hour: v.pricePerHour,
    night_surcharge_per_hour: v.nightSurchargePerHour,
    night_starts_at: v.nightStartsAt,
    status: v.status,
  }

  if (courtId) {
    const { data, error } = await supabase
      .from('courts')
      .update(fields)
      .eq('id', courtId)
      .eq('org_id', auth.ctx.orgId)
      .select('id')
    if (error) {
      console.error('saveCourt update failed', { code: error.code, message: error.message })
      return { ok: false, message: 'Could not save the court. Please try again.' }
    }
    if (!data?.length) return { ok: false, message: 'That court no longer exists.' }
  } else {
    const { error } = await supabase.from('courts').insert({ ...fields, org_id: auth.ctx.orgId })
    if (error) {
      console.error('saveCourt insert failed', { code: error.code, message: error.message })
      return { ok: false, message: 'Could not add the court. Please try again.' }
    }
  }

  revalidatePath('/dashboard/org/courts')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return { ok: true }
}

/** Quick Active <-> Maintenance switch from the court list. */
export async function setCourtStatus(courtId: string, status: 'active' | 'maintenance'): Promise<CourtActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (status !== 'active' && status !== 'maintenance') return { ok: false, message: 'Invalid status.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('courts')
    .update({ status })
    .eq('id', courtId)
    .eq('org_id', auth.ctx.orgId)
    .select('id')
  if (error) {
    console.error('setCourtStatus failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not update the court. Please try again.' }
  }
  if (!data?.length) return { ok: false, message: 'That court no longer exists.' }

  revalidatePath('/dashboard/org/courts')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return { ok: true }
}

/**
 * "Delete" a court = archive it (soft delete). It leaves the public page, the booking calendar and
 * the live court list, but every booking made on it keeps its court, so history and revenue stay
 * correct. A court with upcoming bookings cannot be archived (the database refuses too): cancel or
 * move those first. Done with the service role because clients cannot write `deleted_at` at all
 * (the RLS policy forbids it), after the owner check.
 */
export async function archiveCourtAction(courtId: string): Promise<CourtActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courtId)) return { ok: false, message: 'Invalid court.' }

  const { data, error } = await getSupabaseAdmin()
    .from('courts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', courtId)
    .eq('org_id', auth.ctx.orgId)
    .is('deleted_at', null)
    .select('id')
  if (error) {
    const upcoming = error.message.match(/has_upcoming_bookings:(\d+)/)
    if (upcoming) {
      const n = Number(upcoming[1])
      return { ok: false, message: `This court has ${n} upcoming booking${n === 1 ? '' : 's'}. Cancel or move ${n === 1 ? 'it' : 'them'} first, then archive the court.` }
    }
    console.error('archiveCourt failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not archive the court. Please try again.' }
  }
  if (!data?.length) return { ok: false, message: 'That court no longer exists.' }

  revalidatePath('/dashboard/org/courts')
  revalidatePath('/dashboard/org/bookings')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  revalidatePath('/courts')
  revalidatePath('/')
  return { ok: true }
}

/** Bring an archived court back, exactly as it was (its status and prices are untouched). */
export async function restoreCourtAction(courtId: string): Promise<CourtActionResult> {
  const auth = await requireOrgAction(['org_admin'])
  if (!auth.ok) return auth
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courtId)) return { ok: false, message: 'Invalid court.' }

  const { data, error } = await getSupabaseAdmin()
    .from('courts')
    .update({ deleted_at: null })
    .eq('id', courtId)
    .eq('org_id', auth.ctx.orgId)
    .not('deleted_at', 'is', null)
    .select('id')
  if (error) {
    console.error('restoreCourt failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not restore the court. Please try again.' }
  }
  if (!data?.length) return { ok: false, message: 'That court is not archived.' }

  revalidatePath('/dashboard/org/courts')
  revalidatePath('/dashboard/org/bookings')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  revalidatePath('/courts')
  revalidatePath('/')
  return { ok: true }
}
