'use client'

import * as React from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { HourStat, TrendPoint } from '@/lib/analytics'
import { cn } from '@/lib/utils'

// Palette from DESIGN.md. Lime Pulse is reserved for actions, so data uses
// Peacock Teal (primary series) and Ash Mauve (secondary / muted).
const TEAL = '#0e634f'
const ASH = '#645757'
const GRID = '#d7d2cc'
const AXIS = { fontSize: 12, fill: ASH } as const

const tnd = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(n)} TND`
const pct = (n: number | null) => (n === null ? 'n/d' : `${Math.round(n * 100)} %`)

function TooltipCard({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-[#d7d2cc] bg-[#f7f5f2] px-3 py-2 text-xs">
      <p className="mb-1 font-semibold text-[#2a1a1d]">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-[#2a1a1d]">
          {r.color && <span aria-hidden className="size-2 rounded-sm" style={{ background: r.color }} />}
          <span className="text-[#645757]">{r.label}</span>
          <span className="ml-auto pl-4 font-medium tabular-nums">{r.value}</span>
        </p>
      ))}
    </div>
  )
}

function Legend({ items }: { items: { label: string; color: string; opacity?: number }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[#645757]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-sm" style={{ background: i.color, opacity: i.opacity ?? 1 }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

type Metric = 'bookings' | 'revenue'

export function TrendChart({ points, granularity }: { points: TrendPoint[]; granularity: 'day' | 'week' | 'month' }) {
  const [metric, setMetric] = React.useState<Metric>('bookings')
  const empty = points.every((p) => p.bookings === 0 && p.cancelled === 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[#645757]">Par {granularity === 'day' ? 'jour' : granularity === 'week' ? 'semaine' : 'mois'}, selon le jour de début du match</p>
        <div role="group" aria-label="Indicateur du graphique" className="flex gap-1 rounded-lg bg-[#f7f5f2] p-1">
          {(['bookings', 'revenue'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors',
                metric === m ? 'bg-[#1d3023] text-[#f7f5f2]' : 'text-[#645757] hover:text-[#2a1a1d]'
              )}
            >
              {m === 'bookings' ? 'Réservations' : 'Revenus'}
            </button>
          ))}
        </div>
      </div>

      {empty ? (
        <p className="py-16 text-center text-sm text-[#645757]">Aucune réservation sur cette période.</p>
      ) : (
        <>
          <div role="img" aria-label={`${metric === 'bookings' ? 'Réservations' : 'Revenus'} par ${granularity === 'day' ? 'jour' : granularity === 'week' ? 'semaine' : 'mois'}`} className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {metric === 'bookings' ? (
                <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip
                    cursor={{ fill: '#eae6df' }}
                    content={({ active, payload }) => {
                      const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined
                      return p ? (
                        <TooltipCard
                          title={p.label}
                          rows={[
                            { label: 'Réservations', value: String(p.bookings), color: TEAL },
                            { label: 'Annulées', value: String(p.cancelled), color: ASH },
                          ]}
                        />
                      ) : null
                    }}
                  />
                  <Bar dataKey="bookings" stackId="a" fill={TEAL} />
                  <Bar dataKey="cancelled" stackId="a" fill={ASH} fillOpacity={0.45} radius={[3, 3, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    content={({ active, payload }) => {
                      const p = active ? (payload?.[0]?.payload as TrendPoint | undefined) : undefined
                      return p ? (
                        <TooltipCard title={p.label} rows={[{ label: 'Revenus', value: tnd(p.revenue), color: TEAL }]} />
                      ) : null
                    }}
                  />
                  <Line type="monotone" dataKey="revenue" stroke={TEAL} strokeWidth={2} dot={points.length <= 31} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
          {metric === 'bookings' && (
            <Legend
              items={[
                { label: 'Réservations', color: TEAL },
                { label: 'Annulées', color: ASH, opacity: 0.45 },
              ]}
            />
          )}
        </>
      )}
    </div>
  )
}

export function HoursChart({ hours }: { hours: HourStat[] }) {
  const data = hours.map((h) => ({ ...h, pct: h.rate === null ? 0 : Math.round(h.rate * 100) }))
  if (data.length === 0) {
    return <p className="py-16 text-center text-sm text-[#645757]">Aucun horaire d&apos;ouverture ni réservation sur cette période.</p>
  }
  return (
    <div>
      <div role="img" aria-label="Occupation par heure de la journée" className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tick={AXIS}
              tickLine={false}
              axisLine={{ stroke: GRID }}
              interval="preserveStartEnd"
              minTickGap={12}
            />
            <YAxis domain={[0, 100]} unit="%" tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: '#eae6df' }}
              content={({ active, payload }) => {
                const h = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined
                return h ? (
                  <TooltipCard
                    title={`${h.label} · ${h.peak ? 'Pointe' : 'Heures creuses'}`}
                    rows={[
                      { label: 'Occupation', value: pct(h.rate), color: h.peak ? TEAL : ASH },
                      { label: 'Réservé', value: `${Math.round(h.booked / 60)} h` },
                      { label: 'Ouvert', value: `${Math.round(h.available / 60)} h` },
                    ]}
                  />
                ) : null
              }}
            />
            <Bar dataKey="pct" radius={[3, 3, 0, 0]}>
              {data.map((h) => (
                <Cell key={h.hour} fill={h.peak ? TEAL : ASH} fillOpacity={h.peak ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: 'Pointe (17 h 00 à 04 h 59)', color: TEAL },
          { label: 'Heures creuses', color: ASH, opacity: 0.55 },
        ]}
      />
    </div>
  )
}
