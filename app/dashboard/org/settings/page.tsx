import { redirect } from 'next/navigation'

import { ClubProfileForm } from '@/components/dashboard/club-profile-form'
import { HoursForm } from '@/components/dashboard/hours-form'
import { ownGalleryUrls } from '@/lib/club-profile'
import { getOrgAccess } from '@/lib/org-access'
import { DEFAULT_WEEKLY_HOURS, parseWeeklyHours } from '@/lib/operating-hours'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Owner settings: the club's public profile ("vitrine") and its opening hours. */
export default async function OrgSettingsPage() {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const supabase = await createClient()
  const { data: org } = await supabase
    .from('organizations')
    .select('name, description, whatsapp_number, address, city, latitude, longitude, gallery_urls, weekly_hours')
    .eq('id', access.ctx.orgId)
    .maybeSingle()
  if (!org) redirect('/dashboard/org')

  const saved = parseWeeklyHours(org.weekly_hours)
  return (
    <div className="mx-auto max-w-3xl space-y-14">
      <nav aria-label="Settings sections" className="flex gap-4 text-sm">
        <a href="#profile" className="underline-offset-4 hover:underline">
          Club profile
        </a>
        <a href="#hours" className="underline-offset-4 hover:underline">
          Opening hours
        </a>
      </nav>

      <div id="profile" className="scroll-mt-6">
        <ClubProfileForm
          initial={{
            name: org.name,
            description: org.description,
            whatsappNumber: org.whatsapp_number,
            address: org.address,
            city: org.city,
            latitude: org.latitude,
            longitude: org.longitude,
            galleryUrls: ownGalleryUrls(org.gallery_urls, access.ctx.orgId, process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
          }}
        />
      </div>

      <div id="hours" className="scroll-mt-6">
        <HoursForm initial={saved ?? DEFAULT_WEEKLY_HOURS} configured={Boolean(saved)} />
      </div>
    </div>
  )
}
