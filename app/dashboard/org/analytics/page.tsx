import { redirect } from 'next/navigation'

import { HoursChart, TrendChart } from '@/components/analytics/charts'
import { RangeFilter } from '@/components/analytics/range-filter'
import type { Analytics } from '@/lib/analytics'
import { loadOrgAnalytics } from '@/lib/analytics-loader'
import { formatVenueDate, venueDateString } from '@/lib/court-time'
import { getOrgAccess } from '@/lib/org-access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Analytics' }

const tnd = (n: number) => `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n)} TND`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const pct = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n * 100)}%`)

export default async function OrgAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const access = await getOrgAccess()
  if (access.kind !== 'ok') redirect('/dashboard/org')
  // Revenue is the owner's. Staff run the bookings and never see these numbers.
  if (access.ctx.role !== 'org_admin') redirect('/dashboard/org/bookings')

  const result = await loadOrgAnalytics((await searchParams) ?? {})
  if (!result.ok) {
    if (result.reason === 'forbidden') redirect('/dashboard/org/bookings')
    return (
      <div role="alert" className="rounded-xl bg-[#eae6df] px-6 py-10 text-center text-sm">
        We couldn&apos;t load your analytics. Please refresh in a moment.
      </div>
    )
  }
  const { data, truncated } = result
  const today = venueDateString()

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
          <p className="mt-1 text-sm text-[#645757]" data-testid="range-summary">
            {formatVenueDate(data.range.from)} to {formatVenueDate(data.range.to)} · {data.range.days}{' '}
            {data.range.days === 1 ? 'day' : 'days'} · all amounts in TND
          </p>
        </div>
        <RangeFilter preset={data.range.preset} from={data.range.from} to={data.range.to} today={today} />
      </div>

      {truncated && (
        <p role="status" className="rounded-lg bg-[#eae6df] px-4 py-3 text-sm">
          This period has more bookings than we can summarise at once, so the most recent ones are left out. Choose a
          shorter range for exact figures.
        </p>
      )}

      <Headline data={data} />

      <section aria-labelledby="kpi-heading" className="space-y-3">
        <h3 id="kpi-heading" className="text-lg font-semibold">
          Selected period
        </h3>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Revenue" value={tnd(data.kpis.revenue)} hint={`${plural(data.kpis.bookings, 'booking')}, cancellations excluded`} />
          <Kpi label="Average per booking" value={tnd(data.kpis.avgPerBooking)} />
          <Kpi
            label="Average occupancy"
            value={pct(data.kpis.occupancy)}
            hint={`Peak ${pct(data.peak.peak)} · Off-peak ${pct(data.peak.offPeak)}`}
          />
          <Kpi
            label="Cancellation rate"
            value={pct(data.cancellations.rate)}
            hint={`${data.cancellations.count} of ${plural(data.cancellations.total, 'booking')} · ${tnd(data.cancellations.lost)} lost`}
          />
        </dl>
      </section>

      <Card title="Bookings over time">
        <TrendChart points={data.trend.points} granularity={data.trend.granularity} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Payments">
          <PaymentTable data={data} />
        </Card>
        <Card title="Players">
          <Players data={data} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Occupancy by hour">
          <HoursChart hours={data.hours} />
        </Card>
        <Card title="Top courts">
          <TopCourts data={data} />
        </Card>
      </div>

      <details className="rounded-xl bg-[#eae6df] px-5 py-4 text-sm text-[#645757]">
        <summary className="cursor-pointer font-medium text-[#2a1a1d]">How these numbers are counted</summary>
        <ul className="mt-3 list-disc space-y-1.5 pl-5">
          <li>A booking counts on the day it starts, in Tunis time.</li>
          <li>Revenue is the price of bookings that were not cancelled or refunded, whether or not the cash has reached you yet.</li>
          <li>Occupancy is booked playing time divided by opening time of active courts. The 15-minute buffer between slots is not counted as booked, so a fully booked day reads below 100%.</li>
          <li>Peak hours run from 17:00 to 04:59. Everything else is off-peak.</li>
          <li>Returning players are people with two or more bookings in the period. Guests are matched by phone number.</li>
          <li>Lost revenue is the price of cancelled bookings, the money you would have earned had they been kept.</li>
        </ul>
      </details>
    </div>
  )
}

function Headline({ data }: { data: Analytics }) {
  const items = [
    { label: 'Today', p: data.periods.today },
    { label: 'This week', p: data.periods.week },
    { label: 'This month', p: data.periods.month },
    { label: 'Year to date', p: data.periods.ytd },
  ]
  return (
    <section aria-labelledby="headline-heading" className="space-y-3">
      <h3 id="headline-heading" className="text-lg font-semibold">
        Revenue to date
      </h3>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(({ label, p }) => (
          <Kpi
            key={label}
            label={label}
            value={tnd(p.revenue)}
            hint={`${plural(p.bookings, 'booking')} · ${tnd(p.collected)} collected`}
          />
        ))}
      </dl>
    </section>
  )
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[#eae6df] p-5">
      <dt className="text-sm text-[#645757]">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
      {hint && <p className="mt-1 text-xs text-[#645757]">{hint}</p>}
    </div>
  )
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl bg-[#eae6df] p-5 ${className ?? ''}`}>
      <h3 className="mb-4 text-lg font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function PaymentTable({ data }: { data: Analytics }) {
  const rows = data.payments
  if (rows.every((r) => r.count === 0)) return <p className="py-8 text-center text-sm text-[#645757]">No payments in this period.</p>
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#d7d2cc] text-left text-xs uppercase tracking-wide text-[#645757]">
          <th scope="col" className="pb-2 font-medium">Status</th>
          <th scope="col" className="pb-2 text-right font-medium">Bookings</th>
          <th scope="col" className="pb-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-[#d7d2cc]/60 last:border-0">
            <th scope="row" className="py-2.5 text-left font-normal">{r.label}</th>
            <td className="py-2.5 text-right tabular-nums">{r.count}</td>
            <td className="py-2.5 text-right font-medium tabular-nums">{tnd(r.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-[#d7d2cc]">
          <th scope="row" className="pt-3 text-left font-medium">Collected</th>
          <td />
          <td className="pt-3 text-right font-semibold tabular-nums">{tnd(data.kpis.collected)}</td>
        </tr>
        <tr>
          <th scope="row" className="pt-1 text-left font-medium">Still to collect</th>
          <td />
          <td className="pt-1 text-right font-semibold tabular-nums">{tnd(data.kpis.outstanding)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function Players({ data }: { data: Analytics }) {
  const { members, guests, uniqueBookers, returning, returningRate } = data.players
  const total = members.bookings + guests.bookings
  if (total === 0) return <p className="py-8 text-center text-sm text-[#645757]">No bookings in this period.</p>
  const memberShare = (members.bookings / total) * 100
  return (
    <div className="space-y-5">
      <div>
        <div
          role="img"
          aria-label={`${Math.round(memberShare)}% of bookings by registered members, ${Math.round(100 - memberShare)}% by guests and walk-ins`}
          className="flex h-3 overflow-hidden rounded-full bg-[#d7d2cc]"
        >
          <div className="bg-[#0e634f]" style={{ width: `${memberShare}%` }} />
          <div className="bg-[#645757]/50" style={{ width: `${100 - memberShare}%` }} />
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="flex items-center gap-1.5 text-[#645757]">
              <span aria-hidden className="size-2.5 rounded-sm bg-[#0e634f]" /> Registered members
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{plural(members.bookings, 'booking')}</dd>
            <dd className="text-xs text-[#645757] tabular-nums">{tnd(members.revenue)}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[#645757]">
              <span aria-hidden className="size-2.5 rounded-sm bg-[#645757]/50" /> Guests and walk-ins
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{plural(guests.bookings, 'booking')}</dd>
            <dd className="text-xs text-[#645757] tabular-nums">{tnd(guests.revenue)}</dd>
          </div>
        </dl>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-t border-[#d7d2cc] pt-4 text-sm">
        <div>
          <dt className="text-[#645757]">Different players</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">{uniqueBookers}</dd>
        </div>
        <div>
          <dt className="text-[#645757]">Came back (2+ bookings)</dt>
          <dd className="mt-0.5 text-xl font-semibold tabular-nums">
            {returning} <span className="text-sm font-normal text-[#645757]">({pct(returningRate)})</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function TopCourts({ data }: { data: Analytics }) {
  const courts = data.courts
  if (courts.length === 0) return <p className="py-8 text-center text-sm text-[#645757]">No courts to report on yet.</p>
  const max = Math.max(...courts.map((c) => c.revenue), 1)
  return (
    <ol className="space-y-4">
      {courts.slice(0, 8).map((c, i) => (
        <li key={c.id}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">
              <span className="mr-2 text-[#645757] tabular-nums">{i + 1}.</span>
              {c.name}
              {c.sport && <span className="ml-2 text-xs font-normal capitalize text-[#645757]">{c.sport}</span>}
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{tnd(c.revenue)}</span>
          </div>
          <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#d7d2cc]">
            <div className="h-full rounded-full bg-[#0e634f]" style={{ width: `${(c.revenue / max) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-[#645757] tabular-nums">
            {plural(c.bookings, 'booking')} · {pct(c.occupancy)} occupancy
          </p>
        </li>
      ))}
    </ol>
  )
}
