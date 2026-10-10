'use client'

import * as React from 'react'

import { CourtSlotMatrix, type MatrixCourt, type MatrixSelection } from '@/components/courts/court-slot-matrix'
import { DayPicker } from '@/components/courts/day-picker'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { InfoTip } from '@/components/ui/info-tip'
import { BUFFER_MIN, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Slot picker (Milestone 9): pick a day, then a slot on a court.
   Composes the day navigator and the court matrix (which owns the slot grid,
   its states and the realtime updates) with a legend that explains the colours
   and a note on the sport's fixed slot length.
   ========================================================================== */

const SPORT_NAME: Record<Sport, string> = { padel: 'Padel', tennis: 'Tennis', football: 'Football' }

/** What the colours and tags on the grid mean. */
export function SlotLegend({ hasPeak, nightStartsAt }: { hasPeak: boolean; nightStartsAt?: string }) {
  const items: { label: string; swatch: string }[] = [
    { label: 'Disponible', swatch: 'border-success/40 bg-success/5' },
    { label: 'Sélectionné', swatch: 'border-primary bg-primary' },
    { label: 'Réservé ou indisponible', swatch: 'border-border bg-muted opacity-60' },
  ]
  return (
    <ul aria-label="Légende" className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
      {items.map(({ label, swatch }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={cn('size-3.5 rounded-sm border', swatch)} />
          {label}
        </li>
      ))}
      {hasPeak && (
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="rounded-sm bg-accent px-1 text-[0.65rem] font-medium uppercase tracking-wide text-accent-foreground"
          >
            Pointe
          </span>
          <span className="sr-only">Créneaux de pointe</span>
          <InfoTip label="À propos des créneaux de pointe">
            Les créneaux de pointe incluent le supplément de soirée{nightStartsAt ? ` (créneaux à partir de ${nightStartsAt.slice(0, 5)})` : ''} ; les autres
            créneaux sont en heures creuses.
          </InfoTip>
        </li>
      )}
    </ul>
  )
}

export function SlotPicker({
  orgId,
  dateStr,
  minDate,
  maxDate,
  courts,
  onDateChange,
  onSelect,
  onRealtimeChange,
  pending = false,
  closedNotice = null,
  matrixKey = 0,
}: {
  orgId: string
  dateStr: string
  minDate: string
  maxDate: string
  courts: MatrixCourt[]
  onDateChange: (next: string) => void
  onSelect: (picked: MatrixSelection | null) => void
  /** Another player's booking changed availability: re-fetch. */
  onRealtimeChange: () => void
  /** A new day is loading. */
  pending?: boolean
  closedNotice?: string | null
  /** Bump to remount the matrix and clear its highlighted slot. */
  matrixKey?: number
}) {
  const peakCourt = courts.find((c) => (c.nightSurchargePerHour ?? 0) > 0)
  const sports = [...new Set(courts.map((c) => c.sport))]

  return (
    <div className="space-y-4">
      <DayPicker dateStr={dateStr} minDate={minDate} maxDate={maxDate} onChange={onDateChange} pending={pending} />

      {closedNotice && (
        <p role="status" className="rounded-lg bg-card px-4 py-3 text-sm text-muted-foreground">
          {closedNotice}
        </p>
      )}

      {/* A new day is loading: show the shape of the grid at once instead of stale slots. */}
      {pending && (
        <div role="status" aria-label="Chargement des disponibilités" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}
      <div className={cn(pending && 'hidden')} aria-busy={pending}>
        <CourtSlotMatrix
          key={`${dateStr}-${matrixKey}`}
          courtData={courts}
          selectedDate={dateStr}
          onSlotSelect={onSelect}
          realtime={{ orgId, onChange: onRealtimeChange }}
          hideSummaryOnMobile
        />
      </div>

      <div className="space-y-2">
        <SlotLegend hasPeak={Boolean(peakCourt)} nightStartsAt={peakCourt?.nightStartsAt} />
        {sports.length > 0 && (
          <ul aria-label="Durées des créneaux" className="flex flex-wrap items-center gap-1.5">
            {sports.map((sp) => (
              <li key={sp}>
                <Badge variant="outline" className="tabular-nums">
                  {SPORT_NAME[sp]} · {SPORT_DURATION_MIN[sp]} min
                </Badge>
              </li>
            ))}
            <li>
              <InfoTip label="À propos des durées et du battement">
                La durée des créneaux est fixe selon le sport. Un battement de {BUFFER_MIN} min est laissé libre entre deux réservations.
              </InfoTip>
            </li>
          </ul>
        )}
      </div>
    </div>
  )
}
