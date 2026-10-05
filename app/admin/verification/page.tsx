import Link from 'next/link'
import { MapPin } from 'lucide-react'

import { ArchiveDialog } from '@/components/admin/archive-dialog'
import { ReviewDialog } from '@/components/admin/review-dialog'
import { Badge } from '@/components/ui/badge'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import {
  loadQueue,
  parseQueueStatus,
  QUEUE_STATUSES,
  type QueueStatus,
  type VerificationRow,
} from '@/lib/admin/verification'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const TAB_LABEL: Record<QueueStatus, string> = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', archived: 'Archived' }
const EMPTY: Record<QueueStatus, string> = {
  pending: 'No clubs are waiting for review.',
  approved: 'No clubs have been approved yet.',
  rejected: 'No clubs have been rejected.',
  archived: 'No clubs have been archived.',
}

function stamp(iso: string) {
  const at = new Date(iso)
  return `${formatVenueDate(venueDateString(at))}, ${formatVenueTime(at)}`
}

export default async function VerificationQueuePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>
}) {
  const status = parseQueueStatus((await searchParams)?.status)
  const result = await loadQueue(status)

  return (
    <div className="space-y-6">
      <nav aria-label="Verification queue" className="flex flex-wrap gap-2">
        {QUEUE_STATUSES.map((s) => {
          const active = s === status
          const count = result.ok ? result.counts[s] : null
          return (
            <Link
              key={s}
              href={s === 'pending' ? '/admin/verification' : `/admin/verification?status=${s}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                active ? 'bg-[#1d3023] text-[#f7f5f2]' : 'bg-[#eae6df] hover:bg-[#d7d2cc]'
              )}
            >
              {TAB_LABEL[s]}
              {count !== null && (
                <span
                  className={cn('rounded-full px-2 text-xs tabular-nums', active ? 'bg-[#f7f5f2]/15' : 'bg-[#f7f5f2]')}
                >
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {!result.ok ? (
        <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
          {result.message} Please refresh in a moment.
        </div>
      ) : result.rows.length === 0 ? (
        <div className="rounded-xl bg-[#eae6df] px-6 py-16 text-center">
          <p className="text-lg font-semibold">{EMPTY[status]}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
          {result.rows.map((row) => (
            <OrgCard key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}

function OrgCard({ row }: { row: VerificationRow }) {
  const hasCoords = row.latitude !== null && row.longitude !== null
  return (
    <li className="flex flex-col rounded-xl bg-[#eae6df] p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-base font-semibold leading-snug">{row.name}</h2>
        <Badge variant={row.archived ? 'secondary' : row.status === 'approved' ? 'success' : row.status === 'rejected' ? 'destructive' : 'warning'}>
          {row.archived ? 'Archived' : row.status === 'approved' ? 'Approved' : row.status === 'rejected' ? 'Rejected' : 'Pending'}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {row.sportTypes.map((s) => (
          <Badge key={s} variant="outline" className="capitalize">
            {s}
          </Badge>
        ))}
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Row label="Owner" value={row.ownerName ?? 'Unknown'} />
        <Row label="Email" value={row.ownerEmail ?? 'Unknown'} />
        <Row label="Phone" value={row.ownerPhone?.trim() || 'Not given'} />
        <Row label="City" value={row.city ?? 'Not given'} />
        <Row label="Address" value={row.address ?? 'Not given'} />
        <Row label="Registry no." value={row.registryNumber ?? 'Not given'} />
        <div>
          <dt className="text-xs text-[#645757]">Map</dt>
          <dd className="flex items-center gap-1.5">
            {hasCoords ? (
              <>
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <a
                  href={`https://www.openstreetmap.org/?mlat=${row.latitude}&mlon=${row.longitude}#map=16/${row.latitude}/${row.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tabular-nums underline-offset-4 hover:underline"
                >
                  {row.latitude!.toFixed(5)}, {row.longitude!.toFixed(5)}
                </a>
              </>
            ) : (
              'Not given'
            )}
          </dd>
        </div>
        <Row label="Registered" value={stamp(row.createdAt)} />
        {row.reviewedAt && row.status !== 'pending' && <Row label="Reviewed" value={stamp(row.reviewedAt)} />}
      </dl>

      {row.status === 'rejected' && row.rejectionReason && (
        <p className="mt-3 rounded-lg bg-[#f7f5f2] px-3 py-2 text-sm">
          <span className="text-[#645757]">Reason: </span>
          {row.rejectionReason}
        </p>
      )}

      <div className="mt-auto space-y-2 pt-4">
        {!row.archived && (
          <ReviewDialog
            orgId={row.id}
            orgName={row.name}
            hasDocument={row.hasDocument}
            canApprove={row.status !== 'approved'}
            canReject={row.status === 'pending'}
          />
        )}
        <ArchiveDialog orgId={row.id} orgName={row.name} archived={row.archived} />
      </div>
    </li>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[#645757]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}
