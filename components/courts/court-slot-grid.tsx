'use client'

import { useState, useCallback } from 'react'
import { SlotStateBadge } from '@/components/ui/slot-state'
import type { SlotInterval } from '@/lib/slot-resolver'

/* ------------------------------------------------------------------ */
/*  Milestone 3 — Task 7: refined interactive Slot Matrix             */
/*  - Multi-court row-based grid (time windows × courts)             */
/*  - Keyboard-navigable (Tab through slots)                         */
/*  - Click handler ready for booking drawer integration              */
/*  - Realtime-ready props (courtId, sport, dateStr)                 */
/* ------------------------------------------------------------------ */

export interface CourtSlotSelection {
  courtId: string
  courtName: string
  sport: string
  selectedSlot: SlotInterval | null
  dateStr: string
  pricePerHour: number
}

export function CourtSlotGrid({
  courtId,
  courtName,
  sport,
  initialSlots,
  dateStr,
  pricePerHour,
  onSlotSelect,
}: {
  courtId: string
  courtName: string
  sport: string
  initialSlots: SlotInterval[]
  dateStr: string
  pricePerHour: number
  onSlotSelect?: (selection: CourtSlotSelection) => void
}) {
  const [slots] = useState<SlotInterval[]>(initialSlots)
  const [selectedSlot, setSelectedSlot] = useState<SlotInterval | null>(null)

  const handleSlotClick = useCallback((slot: SlotInterval) => {
    if (slot.state === 'available') {
      const newSelection = slot.start === selectedSlot?.start ? null : slot
      setSelectedSlot(newSelection)
      if (onSlotSelect) {
        onSlotSelect({
          courtId,
          courtName,
          sport,
          selectedSlot: newSelection,
          dateStr,
          pricePerHour,
        })
      }
    }
  }, [courtId, courtName, sport, dateStr, pricePerHour, selectedSlot, onSlotSelect])

  return (
    <div className="space-y-4">
      {/* Header row: time labels */}
      <div className="text-xs text-muted-foreground font-medium tracking-wide mb-2 uppercase">
        Time slots — click an available slot to reserve
      </div>
      {/* Grid: 4 columns on desktop, 2 on mobile */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {slots.map((slot) => (
          <button
            key={`${courtId}-${slot.start}`}
            onClick={() => handleSlotClick(slot)}
            className={`group relative rounded-xl border px-4 py-4 text-left shadow-sm transition hover:shadow-lg focus:outline-none focus:ring-3 focus:ring-emerald-300 focus:ring-offset-2 ${
              selectedSlot?.start === slot.start
                ? 'ring-2 ring-emerald-500 ring-offset-1'
                : ''
            } ${
              slot.state === 'available'
                ? 'bg-emerald-50/60 border-emerald-200 hover:bg-emerald-100/80 hover:-translate-y-0.5'
                : slot.state === 'occupied'
                ? 'bg-rose-50/40 border-rose-200/60 cursor-not-allowed'
                : slot.state === 'locked_buffer'
                ? 'bg-amber-50/40 border-amber-200/60 cursor-not-allowed'
                : 'bg-slate-100/60 border-slate-200/60 text-slate-400 cursor-not-allowed'
            }`}
            aria-label={`${slot.state} slot at ${new Date(slot.start).toLocaleTimeString()}`}
            aria-pressed={selectedSlot?.start === slot.start}
            disabled={slot.state !== 'available'}
          >
            {/* Top row: state badge + selected indicator */}
            <div className="flex items-center justify-between mb-2">
              <SlotStateBadge state={slot.state} />
              {selectedSlot?.start === slot.start && (
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                  Selected
                </span>
              )}
            </div>
            {/* Middle: time window */}
            <div className="font-semibold text-sm text-foreground mb-2 leading-snug">
              <span className="text-xs text-muted-foreground font-medium">Start</span>{' '}
              {new Date(slot.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              → {new Date(slot.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
            {/* Bottom: duration + sport reminder */}
            <div className="mt-3 pt-2 border-t border-current/10 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
              {sport} · {Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60000)} min
            </div>
          </button>
        ))}
      </div>

      {/* Selected slot preview (booking integration point for Task 9) */}
      {selectedSlot && (
        <div
          className="rounded-xl border bg-emerald-50 border-emerald-200 p-4 mt-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
          aria-live="polite"
          aria-label="Selected slot details"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-emerald-800">Selected Slot</h3>
              <p className="text-sm text-emerald-700">
                {new Date(selectedSlot.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                {' → '}
                {new Date(selectedSlot.end).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                {' — '}
                {sport}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedSlot(null)
                if (onSlotSelect) {
                  onSlotSelect({
                    courtId,
                    courtName,
                    sport,
                    selectedSlot: null,
                    dateStr,
                    pricePerHour,
                  })
                }
              }}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline"
              aria-label="Cancel selection"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}