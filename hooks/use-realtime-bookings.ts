'use client'

import * as React from 'react'

import { addDays, venueInstant } from '@/lib/court-time'
import { subscribeToBookings } from '@/lib/realtime/bookings-feed'
import { createClient } from '@/lib/supabase/client'

type Row = Record<string, unknown>
type Change = { new: Row; old: Row }

export interface RealtimeBookingsOptions {
  /** Only react to changes on these courts. Omit to react to every court. */
  courtIds?: string[]
  /** Turn the subscription off (mock data, previews) without breaking hook order. */
  enabled?: boolean
  /** Wait this long after the last event before refreshing. Bursts collapse into one. */
  debounceMs?: number
}

/**
 * Live availability for one club.
 *
 * Subscribes to Postgres changes and calls `onChange` (a refresh) when something
 * relevant to `selectedDate` happened:
 *  - `bookings` filtered by `org_id`. RLS decides who receives events: staff get
 *    their club's, a signed-in player only their own.
 *  - `court_slot_locks`, the row that appears when a slot is booked and vanishes
 *    when it is cancelled. Readable by everyone for public courts, so visitors
 *    see other people's bookings here. It has no org_id, so it is narrowed
 *    client-side by `courtIds`.
 *
 * INSERT, UPDATE and DELETE all count. The channel is removed on unmount or when
 * the inputs change, and on reconnect or when the tab becomes visible again the
 * callback fires once to catch up on anything missed while offline or hidden.
 */
export function useRealtimeBookings(
  orgId: string,
  selectedDate: string,
  onChange: () => void,
  options: RealtimeBookingsOptions = {}
) {
  const { enabled = true, debounceMs = 250 } = options
  const courtIds = options.courtIds

  // The latest callback without resubscribing every render.
  const onChangeRef = React.useRef(onChange)
  React.useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // A stable key so a new array with the same ids does not resubscribe.
  const courtKey = courtIds ? [...courtIds].sort().join(',') : null

  React.useEffect(() => {
    if (!enabled || !orgId) return

    const watched = courtKey === null ? null : new Set(courtKey.split(',').filter(Boolean))
    // The venue day plus a margin each side: late-night slots run past midnight
    // and a booking's hold includes its buffer.
    const from = venueInstant(addDays(selectedDate, -1), 0).getTime()
    const to = venueInstant(addDays(selectedDate, 2), 0).getTime()

    const inWindow = (value: unknown) => {
      if (typeof value !== 'string') return true // unknown time: refresh to be safe
      const t = Date.parse(value)
      return Number.isNaN(t) || (t >= from && t < to)
    }
    const onWatchedCourt = (value: unknown) =>
      !watched || typeof value !== 'string' || watched.has(value)

    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      timer = setTimeout(() => onChangeRef.current(), debounceMs)
    }

    // Bookings come through the shared per-club feed (see lib/realtime/bookings-feed.ts):
    // the staff alert bell listens to the same stream, and two separate channels with the
    // same subscription would starve one of them.
    // Declared first: the feed replays its current status synchronously on subscribe.
    let bookingsEverSubscribed = false
    const stopBookings = subscribeToBookings(
      orgId,
      (payload) => {
        // UPDATE/DELETE only carry the primary key in `old`, so read the row
        // from `new` when there is one.
        const row = Object.keys(payload.new ?? {}).length ? payload.new : payload.old
        if (onWatchedCourt(row.court_id) && inWindow(row.starts_at)) refresh()
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          // Reconnected after a drop: anything in between was missed.
          if (bookingsEverSubscribed) refresh()
          bookingsEverSubscribed = true
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Realtime bookings feed problem (polling fallback active):', status)
        }
      },
      // Fallback: reconnects, a fast poll while the socket is down, a slow heartbeat while up.
      () => refresh()
    )
    // Slot locks are this hook's own subscription (public data, no org_id to filter on).
    const supabase = createClient()
    const channel = supabase
      .channel(`slot-locks-${orgId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'court_slot_locks' },
        (payload: Change) => {
          const row = Object.keys(payload.new ?? {}).length ? payload.new : payload.old
          if (onWatchedCourt(row.court_id) && inWindow(row.occupied_from)) refresh()
        }
      )

    // The public slot-locks channel has no shared feed: while it is not subscribed, refresh
    // on a short interval (realtime-js keeps retrying the join in the background).
    let locksDown = false
    const locksFallback = setInterval(() => {
      if (locksDown && document.visibilityState === 'visible') refresh()
    }, 10_000)

    let everSubscribed = false
    channel.subscribe((status) => {
      locksDown = status !== 'SUBSCRIBED'
      if (status === 'SUBSCRIBED') {
        // Reconnected after a drop: anything in between was missed.
        if (everSubscribed) refresh()
        everSubscribed = true
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Realtime slot-locks channel problem (polling fallback active):', status)
      }
    })

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      clearInterval(locksFallback)
      document.removeEventListener('visibilitychange', onVisible)
      stopBookings()
      void supabase.removeChannel(channel)
    }
  }, [orgId, selectedDate, courtKey, enabled, debounceMs])
}
