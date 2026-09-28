'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function SlotRealtime({ courtId }: { courtId: string }) {
  const [locks, setLocks] = useState<any[]>([])
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`court-${courtId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'court_slot_locks', filter: `court_id=eq.${courtId}` }, (payload) => {
        console.log('Slot lock change:', payload)
        // Trigger redraw via state (simplified for M3)
        setLocks((prev) => [...prev])
      })
      .subscribe()
    return () => { ch.unsubscribe() }
  }, [courtId])
  return null // Silent listener for M3
}
