'use client'

import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/client'

/**
 * One shared Realtime subscription to a club's `bookings` changes.
 *
 * Why shared: Supabase Realtime merges identical Postgres-change subscriptions on one
 * connection and delivers each event to only ONE of the channels that asked for it.
 * The bookings board and the staff alert bell both want the same stream, so when each
 * opened its own channel the second one (the bell) silently received nothing. Here
 * every consumer gets every event through a single channel per club, and the channel
 * is closed when the last consumer goes away.
 *
 * RLS decides what arrives: staff get their club's bookings, a signed-in player their
 * own. UPDATE/DELETE `old` carries only the primary key (default replica identity).
 */

type Row = Record<string, unknown>
export type BookingChange = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Row; old: Row }
export type FeedStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'

type Feed = {
  /** Undefined until the access token is in place and the channel is created. */
  channel: RealtimeChannel | undefined
  closed: boolean
  changes: Set<(change: BookingChange) => void>
  statuses: Set<(status: FeedStatus) => void>
  last: FeedStatus | null
  /** Pending teardown, cancelled if someone subscribes again first. */
  closing?: ReturnType<typeof setTimeout>
}

/** How long an unused feed stays open. React's development double mount, and moving between dashboard pages, resubscribe within this. */
const CLOSE_DELAY_MS = 1500

const feeds = new Map<string, Feed>()

function openFeed(orgId: string): Feed {
  const supabase = createClient()
  const feed: Feed = { channel: undefined, changes: new Set(), statuses: new Set(), last: null, closed: false }

  void (async () => {
    // The user's access token must be on the Realtime connection BEFORE the channel joins.
    // Joined without it, the subscription runs as `anon`: row-level security then hides
    // every `bookings` row (nothing ever arrives), while public tables such as
    // court_slot_locks keep working, which makes the failure look like a flaky channel.
    const { data } = await supabase.auth.getSession()
    if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token)
    if (feed.closed) return

    // A unique name per open: a channel of the same name that is still closing would be reused.
    feed.channel = supabase
      .channel(`bookings-feed-${orgId}-${Math.random().toString(36).slice(2, 10)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `org_id=eq.${orgId}` },
        (payload) => {
          const change = { eventType: payload.eventType, new: payload.new as Row, old: payload.old as Row } as BookingChange
          for (const listener of [...feed.changes]) listener(change)
        }
      )
      .subscribe((status) => {
        feed.last = status as FeedStatus
        for (const listener of [...feed.statuses]) listener(feed.last)
      })
  })()
  return feed
}

/**
 * Listen to a club's booking changes. Returns the function that stops listening.
 * `onStatus` is told the connection state (and the current one straight away).
 */
export function subscribeToBookings(
  orgId: string,
  onChange: (change: BookingChange) => void,
  onStatus?: (status: FeedStatus) => void
): () => void {
  let feed = feeds.get(orgId)
  if (!feed) {
    feed = openFeed(orgId)
    feeds.set(orgId, feed)
  }
  clearTimeout(feed.closing)
  feed.closing = undefined
  feed.changes.add(onChange)
  if (onStatus) {
    feed.statuses.add(onStatus)
    if (feed.last) onStatus(feed.last)
  }

  const mine = feed
  return () => {
    mine.changes.delete(onChange)
    if (onStatus) mine.statuses.delete(onStatus)
    if (mine.changes.size === 0 && mine.statuses.size === 0) {
      // Not closed at once: leaving and re-joining the same subscription back to back
      // (a remount) makes Realtime stop delivering to the re-joined channel.
      mine.closing = setTimeout(() => {
        if (mine.changes.size === 0 && mine.statuses.size === 0 && feeds.get(orgId) === mine) {
          feeds.delete(orgId)
          mine.closed = true
          if (mine.channel) void createClient().removeChannel(mine.channel)
        }
      }, CLOSE_DELAY_MS)
    }
  }
}
