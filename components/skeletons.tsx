import { Skeleton } from '@/components/ui/skeleton'

/**
 * Loading skeletons for the `loading.tsx` of data-driven routes. Next shows a
 * route's loading.tsx the moment you click a link (and prefetches it ahead of the
 * click), so the page changes instantly and the data streams in behind it. They
 * mirror the real page's shell so nothing jumps when the content arrives.
 */

function Busy({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  )
}

const PAGE = 'mx-auto w-full max-w-[1920px] px-4 py-10 sm:px-6 lg:px-8 xl:px-12'

function CardRow() {
  return (
    <div className="rounded-xl bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="mt-4 flex gap-6">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  )
}

/** /reservations: the player's bookings. */
export function ReservationsSkeleton() {
  return (
    <main className={PAGE}>
      <Busy label="Chargement de vos réservations" className="mx-auto max-w-3xl">
        <Skeleton className="h-4 w-16" />
        <h1 className="mb-8 mt-4 text-3xl font-semibold tracking-tight">My reservations</h1>
        <Skeleton className="mb-3 h-6 w-28" />
        <div className="space-y-3">
          <CardRow />
          <CardRow />
          <CardRow />
        </div>
      </Busy>
    </main>
  )
}

/** /reservations/[id], /reservations/join, /reservations/cancel-guest: one card. */
export function SingleCardSkeleton({ label = 'Chargement' }: { label?: string }) {
  return (
    <main className={PAGE}>
      <Busy label={label} className="mx-auto max-w-xl">
        <div className="overflow-hidden rounded-xl bg-card">
          <div className="space-y-2 bg-[#1d3023] p-5">
            <Skeleton className="h-3 w-24 bg-white/20" />
            <Skeleton className="h-6 w-48 bg-white/20" />
            <Skeleton className="h-4 w-32 bg-white/20" />
          </div>
          <div className="space-y-4 p-5">
            <div className="flex justify-between gap-4">
              <div className="space-y-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-8 w-40" />
              </div>
              <Skeleton className="size-[168px]" />
            </div>
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      </Busy>
    </main>
  )
}

/** /courts: the club list. */
export function ClubListSkeleton() {
  return (
    <main className={PAGE}>
      <Busy label="Chargement des clubs">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-80 max-w-full" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-xl bg-card p-5">
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </Busy>
    </main>
  )
}

/** /courts/[orgId]: a club with its day picker and court columns. */
export function ClubPageSkeleton() {
  return (
    <main className={PAGE}>
      <Busy label="Chargement des disponibilités">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="mt-4 h-9 w-72 max-w-full" />
        <Skeleton className="mt-3 h-4 w-64 max-w-full" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="size-8" />
          <Skeleton className="h-8 w-44" />
          <Skeleton className="size-8" />
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, c) => (
            <div key={c} className="space-y-3 rounded-xl bg-card p-4">
              <Skeleton className="h-5 w-32" />
              {Array.from({ length: 5 }, (_, s) => (
                <Skeleton key={s} className="h-16 w-full" />
              ))}
            </div>
          ))}
        </div>
      </Busy>
    </main>
  )
}

/** Club dashboard pages (inside the org layout, which already draws the header). */
export function DashboardSkeleton() {
  return (
    <Busy label="Chargement">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-64 max-w-full" />
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-8 h-72 w-full rounded-xl" />
    </Busy>
  )
}

/** Platform admin pages. */
export function AdminSkeleton() {
  return (
    <Busy label="Chargement">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-8 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </Busy>
  )
}
