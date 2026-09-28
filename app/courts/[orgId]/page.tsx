import { createPublicClient } from '@/lib/supabase/public'
import { notFound } from 'next/navigation'
import { resolveCourtSlots } from '@/lib/slot-resolver'
import { CourtDetailClient } from '@/components/courts/court-detail-client'

// Public data read with the anon role: never prerender it with build-time rows.
export const dynamic = 'force-dynamic'

export default async function CourtDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>
  searchParams?: Promise<{ date?: string }>
}) {
  const supabase = createPublicClient()

  const { orgId } = await params
  const dateStr = (await searchParams)?.date ?? new Date().toISOString().split('T')[0]

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, address, city, status')
    .eq('id', orgId)
    .single()

  if (!org || org.status !== 'approved') return notFound()

  const { data: courts } = await supabase
    .from('courts')
    .select('id, name, sport, status, price_per_hour')
    .eq('org_id', orgId)
    .eq('status', 'active')

  const courtsWithSlots = await Promise.all(
    (courts ?? []).map(async (court) => {
      const slots = await resolveCourtSlots(court.id, court.sport, dateStr)
      return { ...court, slots }
    })
  )

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight mb-2">{org.name}</h1>
        <p className="text-muted-foreground text-lg">{org.address ?? ''}, {org.city ?? ''}</p>
      </header>

      <CourtDetailClient
        courtsWithSlots={courtsWithSlots}
        orgId={orgId}
        dateStr={dateStr}
      />
    </main>
  )
}
