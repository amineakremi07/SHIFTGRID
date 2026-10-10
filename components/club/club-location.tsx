'use client'

import dynamic from 'next/dynamic'
import { ExternalLink, MapPin, Navigation } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { directionsLink, osmLink } from '@/lib/club-profile'

// Leaflet needs `window`: the map is loaded in the browser only.
const ClubMap = dynamic(() => import('@/components/club/club-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
})

/** The club's address, its exact pin on an interactive map, and links to open or navigate. */
export function ClubLocation({
  name,
  address,
  latitude,
  longitude,
}: {
  name: string
  address: string | null
  latitude: number
  longitude: number
}) {
  return (
    <section aria-labelledby="club-map-heading" className="space-y-3">
      <h2 id="club-map-heading" className="text-lg font-semibold">
        Nous trouver
      </h2>
      {address && (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
          {address}
        </p>
      )}
      <div
        // `relative z-0 isolate`: Leaflet's panes/controls use z-index up to 1000; this contains them in one
        // stacking context below the dialogs, drawers and toasts (z-50+).
        className="relative isolate z-0 h-72 overflow-hidden rounded-xl border border-border sm:h-80"
        role="region"
        aria-label={`Carte indiquant l'emplacement de ${name}`}
        data-testid="club-map"
      >
        <ClubMap latitude={latitude} longitude={longitude} name={name} />
      </div>
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a
          href={directionsLink(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <Navigation className="size-4" aria-hidden /> Itinéraire
        </a>
        <a
          href={osmLink(latitude, longitude)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
        >
          <ExternalLink className="size-4" aria-hidden /> Ouvrir dans OpenStreetMap
        </a>
      </p>
    </section>
  )
}
