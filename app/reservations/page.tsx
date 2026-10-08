import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { ReservationCard, type Reservation } from '@/components/booking/reservation-card'
import { DeleteAccount } from '@/components/booking/delete-account'
import { TrustBanner } from '@/components/booking/trust-banner'
import { createClient } from '@/lib/supabase/server'
import type { Sport } from '@/lib/types/database'

/** Personal and live: never prerendered or cached. */
export const dynamic = 'force-dynamic'

/** The request time. A function, so the render body itself stays pure. */
const readClock = () => Date.now()

export const metadata = { title: 'My reservations' }

export default async function ReservationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/register?role=player&next=/reservations')

  // The profile (with its club's name embedded), the bookings and the courts only need
  // the user id (RLS scopes the rest), so they go out in ONE round trip.
  // `organizations!profiles_org_id_fkey`: since organization_members there is more than one path from
  // profiles to organizations, and an unhinted embed fails as ambiguous (PGRST201).
  const [profileRes, bookingsRes, courtsRes] = await Promise.all([
    supabase.from('profiles').select('role, org_id, no_show_count, trust_score, is_suspended, suspended_until, organizations!profiles_org_id_fkey(name)').eq('id', user.id).maybeSingle(),
    // RLS: a player sees only their own bookings and their club's courts.
    supabase
      .from('bookings')
      .select('id, court_id, sport, starts_at, ends_at, player_count, status, cancellation_deadline, cancellation_reason')
      .eq('booker_profile_id', user.id)
      .order('starts_at', { ascending: false })
      .limit(100),
    supabase.from('courts').select('id, name').limit(200),
  ])
  const profile = profileRes.data
  if (profile?.role === 'org_admin' || profile?.role === 'staff') redirect('/dashboard/org/bookings')
  if (profile?.role === 'platform_admin') redirect('/admin/verification')

  if (bookingsRes.error) {
    console.error('Failed to load reservations:', { code: bookingsRes.error.code, message: bookingsRes.error.message })
    return (
      <Shell>
        <div role="alert" className="rounded-xl bg-card px-6 py-10 text-center text-sm">
          We couldn&apos;t load your reservations. Please refresh in a moment.
        </div>
      </Shell>
    )
  }

  const courtName = new Map((courtsRes.data ?? []).map((c) => [c.id, c.name]))
  const clubName = profile?.organizations?.name ?? 'Your club'
  const now = readClock()

  const all: Reservation[] = (bookingsRes.data ?? []).map((b) => {
    const open = b.status === 'pending_payment' || b.status === 'confirmed'
    const upcoming = open && Date.parse(b.ends_at) > now
    return {
      id: b.id,
      clubName,
      courtName: (b.court_id && courtName.get(b.court_id)) || 'Court',
      sport: b.sport as Sport,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      playerCount: b.player_count,
      status: b.status,
      reference: b.id.replace(/-/g, '').slice(0, 8).toUpperCase(),
      upcoming,
      canCancel: upcoming && now < Date.parse(b.cancellation_deadline),
      cancelDeadline: b.cancellation_deadline,
      cancellationReason: b.cancellation_reason,
    }
  })

  const upcoming = all.filter((r) => r.upcoming).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const history = all.filter((r) => !r.upcoming)

  return (
    <Shell>
      <TrustBanner
        noShowCount={profile?.no_show_count ?? 0}
        trustScore={profile?.trust_score ?? 100}
        suspendedUntil={profile?.is_suspended ? (profile.suspended_until ?? null) : null}
        now={now}
      />
      <section aria-labelledby="upcoming-heading" className="space-y-3">
        <h2 id="upcoming-heading" className="text-lg font-semibold">
          Upcoming
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-xl bg-card px-6 py-10 text-center">
            <p className="font-medium">No upcoming bookings</p>
            <Link href={profile?.org_id ? `/courts/${profile.org_id}` : '/'} className="mt-2 inline-block text-sm underline-offset-4 hover:underline">
              Book a court
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="mt-10 space-y-3">
          <h2 id="history-heading" className="text-lg font-semibold">
            Past and cancelled
          </h2>
          <ul className="space-y-3">
            {history.map((r) => (
              <ReservationCard key={r.id} reservation={r} />
            ))}
          </ul>
        </section>
      )}

      <DeleteAccount upcomingCount={upcoming.length} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          Home
        </Link>
        <h1 className="mb-8 mt-4 text-3xl font-semibold tracking-tight">My reservations</h1>
        {children}
      </div>
    </main>
  )
}
