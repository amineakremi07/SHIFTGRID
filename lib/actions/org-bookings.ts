'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { checkBookableSlot } from '@/lib/booking-core'
import { requireOrgAction } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { guestDetailsSchema } from '@/lib/validations/booking'

export type OrgBookingResult =
  | { ok: true; reference?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[] | undefined> }

const walkInSchema = z.object({
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().datetime({ offset: true }),
  playerCount: z.number().int(),
  guest: guestDetailsSchema,
})
export type WalkInInput = z.input<typeof walkInSchema>

/**
 * Record a walk-in or phone booking for a guest. It is 'confirmed' straight away
 * (the customer is at the desk or on the phone); cash is collected at the club.
 * Same slot rules, pricing and atomic create_booking() as the public flow, so the
 * GiST constraint still stops a double booking (23P01).
 */
export async function createWalkInBooking(input: WalkInInput): Promise<OrgBookingResult> {
  const auth = await requireOrgAction(['org_admin', 'staff'])
  if (!auth.ok) return auth

  const parsed = walkInSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      message: 'Please check the details and try again.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    }
  }
  const data = parsed.data
  const admin = getSupabaseAdmin()

  const checked = await checkBookableSlot(admin, {
    orgId: auth.ctx.orgId,
    courtId: data.courtId,
    date: data.date,
    startsAt: data.startsAt,
    playerCount: data.playerCount,
  })
  if (!checked.ok) return { ok: false, message: checked.message }

  const { data: booked, error } = await admin.rpc('create_booking', {
    p_org_id: auth.ctx.orgId,
    p_court_id: data.courtId,
    p_sport: checked.sport,
    p_starts_at: data.startsAt,
    p_player_count: data.playerCount,
    p_amount: checked.price.total,
    p_guest_name: data.guest.fullName,
    p_guest_phone: data.guest.phone,
    p_status: 'confirmed',
  })

  if (error) {
    if (error.code === '23P01' || (error.code === '23505' && error.message.includes('court_slot_locks'))) {
      return { ok: false, message: 'That slot was just taken. Pick another time.' }
    }
    if (error.message.includes('slot_in_past')) {
      return { ok: false, message: 'That time has already started. Pick a later slot.' }
    }
    console.error('createWalkInBooking failed', { code: error.code, message: error.message })
    return { ok: false, message: 'Could not create the booking. Please try again.' }
  }

  revalidatePath('/dashboard/org/bookings')
  revalidatePath(`/courts/${auth.ctx.orgId}`)
  return { ok: true, reference: (booked as { reference: string }).reference }
}
