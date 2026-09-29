import Link from 'next/link'

import { ClubDiscovery } from '@/components/home/club-discovery'
import { HeroSection } from '@/components/home/hero-section'
import { HowItWorks } from '@/components/home/how-it-works'
import { buildClubs, type Club } from '@/lib/clubs'
import { createPublicClient } from '@/lib/supabase/public'

/**
 * The club list is public data, the same for every visitor, so the page is
 * regenerated at most once a minute instead of hitting the database per request.
 */
export const revalidate = 60

/** Generous caps; add pagination before a network grows past them. */
const MAX_CLUBS = 200
const MAX_COURTS = 2000

async function loadClubs(): Promise<{ clubs: Club[]; failed: boolean }> {
  // Public (anon) client: RLS + column grants expose only approved
  // organizations, their active courts, and non-sensitive columns.
  const supabase = createPublicClient()

  const [orgs, courts] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, name, address, city, latitude, longitude')
      .eq('status', 'approved')
      .order('name')
      .limit(MAX_CLUBS),
    supabase
      .from('courts')
      .select('id, org_id, name, sport, price_per_hour, open_time, close_time')
      .eq('status', 'active')
      .limit(MAX_COURTS),
  ])

  if (orgs.error || courts.error) {
    // Log plain strings: a Supabase error object can print as `{}`, which hides
    // the cause (e.g. "TypeError: fetch failed" when the URL is unreachable).
    console.error('Failed to load clubs:', {
      organizations: orgs.error?.message,
      organizationsDetails: orgs.error?.details,
      courts: courts.error?.message,
      courtsDetails: courts.error?.details,
    })
    return { clubs: [], failed: true }
  }
  return { clubs: buildClubs(orgs.data, courts.data), failed: false }
}

export default async function Home() {
  const { clubs, failed } = await loadClubs()

  return (
    <>
      <main className="flex-1">
        <HeroSection />
        <ClubDiscovery clubs={clubs} loadFailed={failed} />
        <HowItWorks />
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted-foreground">
          <p>&copy; 2026 ShiftGrid. Sports court booking in Tunisia.</p>
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="#discover" className="hover:text-foreground">
              Clubs
            </Link>
            <Link href="/register?role=owner" className="hover:text-foreground">
              List your club
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
