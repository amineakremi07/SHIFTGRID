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
 *
 * Resilience (WebSockets drop, proxies block them, a busy Realtime tier refuses joins):
 *  - If the channel is not SUBSCRIBED after a drop, it is torn down and re-created with
 *    exponential backoff + jitter (1 s doubling to 30 s), re-reading the session token
 *    each time, instead of hammering a struggling server.
 *  - Consumers may pass `onSync`, a "go and fetch fresh state" signal that does not
 *    depend on events arriving. It fires on every re-subscribe, when the browser comes
 *    back online or the tab becomes visible, on a fast poll (~10 s) while the socket is
 *    down, and on a slow heartbeat (~90 s) while it is healthy, which catches events
 *    lost silently under load. Polling pauses while the tab is hidden.
 */

type Row = Record<string, unknown>
export type BookingChange = { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Row; old: Row }
export type FeedStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
export type SyncReason = 'poll' | 'reconnect' | 'online' | 'visible'

/** Poll interval while the socket is down / the heartbeat while it is up (ms). */
export const POLL_DOWN_MS = 10_000
export const HEARTBEAT_MS = 90_000
const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000

/** Exponential backoff with +-25% jitter, so many dashboards do not reconnect in lockstep. */
export function backoffDelay(attempt: number, random: number = Math.random()): number {
  const base = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt))
  return Math.round(base * (0.75 + random * 0.5))
}

type Feed = {
  /** Undefined until the access token is in place and the channel is created. */
  channel: RealtimeChannel | undefined
  closed: boolean
  changes: Set<(change: BookingChange) => void>
  statuses: Set<(status: FeedStatus) => void>
  syncs: Set<(reason: SyncReason) => void>
  last: FeedStatus | null
  everSubscribed: boolean
  /** Consecutive failed (re)joins, drives the backoff. */
  attempt: number
  retryTimer?: ReturnType<typeof setTimeout>
  pollTimer?: ReturnType<typeof setTimeout>
  /** Removes the window/document listeners and timers. */
  cleanup: () => void
  /** Pending teardown, cancelled if someone subscribes again first. */
  closing?: ReturnType<typeof setTimeout>
}

/** How long an unused feed stays open. React's development double mount, and moving between dashboard pages, resubscribe within this. */
const CLOSE_DELAY_MS = 1500

const feeds = new Map<string, Feed>()

function openFeed(orgId: string): Feed {
  const supabase = createClient()
  const feed: Feed = {
    channel: undefined,
    changes: new Set(),
    statuses: new Set(),
    syncs: new Set(),
    last: null,
    everSubscribed: false,
    attempt: 0,
    closed: false,
    cleanup: () => {},
  }

  const fireSync = (reason: SyncReason) => {
    for (const listener of [...feed.syncs]) listener(reason)
  }

  /** Next poll: fast while down, slow heartbeat while up; skipped (not stacked) while the tab is hidden. */
  const schedulePoll = () => {
    clearTimeout(feed.pollTimer)
    if (feed.closed) return
    const down = feed.last !== 'SUBSCRIBED'
    const delay = Math.round((down ? POLL_DOWN_MS : HEARTBEAT_MS) * (0.8 + Math.random() * 0.4))
    feed.pollTimer = setTimeout(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') fireSync('poll')
      schedulePoll()
    }, delay)
  }

  const join = async () => {
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
        if (feed.closed) return
        const previous = feed.last
        feed.last = status as FeedStatus
        for (const listener of [...feed.statuses]) listener(feed.last)

        if (status === 'SUBSCRIBED') {
          clearTimeout(feed.retryTimer)
          feed.attempt = 0
          // Back after a drop: whatever happened in between was missed, so catch up.
          if (feed.everSubscribed && previous !== 'SUBSCRIBED') fireSync('reconnect')
          feed.everSubscribed = true
          schedulePoll() // back to the slow heartbeat
          return
        }

        if (previous === 'SUBSCRIBED' || previous === null) schedulePoll() // switch to the fast fallback poll now

        // realtime-js retries on its own; if that has not worked by our backoff delay,
        // start over with a fresh channel and a fresh token.
        clearTimeout(feed.retryTimer)
        feed.retryTimer = setTimeout(() => {
          if (feed.closed || feed.last === 'SUBSCRIBED') return
          feed.attempt += 1
          const old = feed.channel
          feed.channel = undefined
          void (async () => {
            if (old) await supabase.removeChannel(old)
            await join()
          })()
        }, backoffDelay(feed.attempt))
      })
  }

  const onOnline = () => fireSync('online')
  const onVisible = () => {
    if (document.visibilityState === 'visible') fireSync('visible')
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
  }
  feed.cleanup = () => {
    clearTimeout(feed.retryTimer)
    clearTimeout(feed.pollTimer)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }

  schedulePoll()
  void join()
  return feed
}

/**
 * Listen to a club's booking changes. Returns the function that stops listening.
 * `onStatus` is told the connection state (and the current one straight away).
 * `onSync` is told when to re-read state from the server because events may have been
 * missed (see the resilience notes above).
 */
export function subscribeToBookings(
  orgId: string,
  onChange: (change: BookingChange) => void,
  onStatus?: (status: FeedStatus) => void,
  onSync?: (reason: SyncReason) => void
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
  if (onSync) feed.syncs.add(onSync)

  const mine = feed
  const idle = () => mine.changes.size === 0 && mine.statuses.size === 0 && mine.syncs.size === 0
  return () => {
    mine.changes.delete(onChange)
    if (onStatus) mine.statuses.delete(onStatus)
    if (onSync) mine.syncs.delete(onSync)
    if (idle()) {
      // Not closed at once: leaving and re-joining the same subscription back to back
      // (a remount) makes Realtime stop delivering to the re-joined channel.
      mine.closing = setTimeout(() => {
        if (idle() && feeds.get(orgId) === mine) {
          feeds.delete(orgId)
          mine.closed = true
          mine.cleanup()
          if (mine.channel) void createClient().removeChannel(mine.channel)
        }
      }, CLOSE_DELAY_MS)
    }
  }
}
