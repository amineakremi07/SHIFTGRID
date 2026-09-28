'use client'

import { useState } from 'react'
import { CourtSlotGrid, type CourtSlotSelection } from '@/components/courts/court-slot-grid'
import { PlayerAuthModal } from '@/components/booking/player-auth-modal'
import { SlotRealtime } from '@/components/courts/slot-realtime'

export function CourtDetailClient({
  courtsWithSlots,
  orgId,
  dateStr,
}: {
  courtsWithSlots: Array<{
    id: string
    name: string
    sport: string
    price_per_hour: number
    status: string
    slots: Array<{
      start: string
      end: string
      state: 'available' | 'occupied' | 'locked_buffer' | 'past'
      bookingId?: string | null
    }>
  }>
  orgId: string
  dateStr: string
}) {
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authModalMode, setAuthModalMode] = useState<'signin' | 'signup' | 'anonymous'>('signin')
  const [pendingSelection, setPendingSelection] = useState<CourtSlotSelection | null>(null)

  const handleSlotSelect = (selection: CourtSlotSelection) => {
    setPendingSelection(selection)
    if (selection.selectedSlot) {
      setAuthModalMode('signin')
      setAuthModalOpen(true)
    }
  }

  const handleAuthSuccess = () => {
    setAuthModalOpen(false)
    setPendingSelection(null)
  }

  return (
    <section className="space-y-8">
      {courtsWithSlots.length === 0 ? (
        <p className="text-muted-foreground">No active courts found.</p>
      ) : (
        courtsWithSlots.map((court) => (
          <article key={court.id} className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{court.name}</h2>
                <p className="text-sm text-muted-foreground capitalize">{court.sport} · TND {court.price_per_hour}/hour</p>
              </div>
              <span className="text-xs text-muted-foreground">Live updates enabled</span>
            </div>

            <CourtSlotGrid
              courtId={court.id}
              courtName={court.name}
              sport={court.sport}
              initialSlots={court.slots}
              dateStr={dateStr}
              pricePerHour={court.price_per_hour}
              onSlotSelect={handleSlotSelect}
            />

            <SlotRealtime courtId={court.id} />
          </article>
        ))
      )}

      {/* Milestone 3 Task 9: Booking integration point — click available slot → Player Auth Modal */}
      <PlayerAuthModal
        orgId={orgId}
        open={authModalOpen}
        onOpenChange={(open: boolean) => {
          setAuthModalOpen(open)
          if (!open) setPendingSelection(null)
        }}
        defaultMode={authModalMode}
        onSuccess={() => {
          // Booking creation deferred to Milestone 4; here we confirm auth and close.
          handleAuthSuccess()
        }}
      />
    </section>
  )
}