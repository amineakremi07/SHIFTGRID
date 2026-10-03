'use client'

import * as React from 'react'
import { Bell } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatVenueDate, formatVenueTime, venueDateString } from '@/lib/court-time'
import { subscribeToBookings } from '@/lib/realtime/bookings-feed'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/**
 * Live alerts for club staff: a bell in the dashboard header that lights up, and a
 * toast, when a slot is booked, paid for, or cancelled, wherever it was done (the
 * public site, a walk-in at the desk, another staff member).
 *
 * It listens to Postgres changes on `bookings`. RLS decides who receives events: only
 * staff of the club get its rows (and the handler ignores any other org's). Alerts live for the session (a
 * refresh clears them): the bookings board and the outbox are the record.
 *
 * Replica identity is the default, so an UPDATE carries no old status. "Cancelled"
 * and "paid" are therefore detected as a change against the last status seen for
 * that booking in this session (an unseen booking that arrives already confirmed is
 * reported as confirmed).
 */

type AlertKind = 'new' | 'paid' | 'cancelled'
type Alert = { id: string; kind: AlertKind; title: string; detail: string; at: number; read: boolean }

const MAX_ALERTS = 20

const TITLE: Record<AlertKind, string> = {
  new: 'New booking',
  paid: 'Booking confirmed',
  cancelled: 'Booking cancelled',
}

type Row = Record<string, unknown>

export function Notifications({ orgId }: { orgId: string }) {
  const [alerts, setAlerts] = React.useState<Alert[]>([])
  const [live, setLive] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const supabase = createClient()
    const lastStatus = new Map<string, string>()
    const courtNames = new Map<string, string>()
    let cancelled = false

    // Court names for the alert text, loaded once (RLS lets staff read their club's courts).
    const courtsReady = supabase
      .from('courts')
      .select('id, name')
      .eq('org_id', orgId)
      .then(({ data }) => {
        for (const c of data ?? []) courtNames.set(c.id, c.name)
      })

    const push = (alert: Alert) => {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, MAX_ALERTS))
      const show = alert.kind === 'cancelled' ? toast.warning : toast.info
      show(alert.title, { description: alert.detail })
    }

    const describe = async (row: Row): Promise<string> => {
      await courtsReady
      const court = courtNames.get(String(row.court_id)) ?? 'Court'
      const start = String(row.starts_at)
      const when = `${formatVenueDate(venueDateString(new Date(start)))}, ${formatVenueTime(start)}`

      // Who booked it, best effort: the alert must not wait on or fail because of this.
      let who = ''
      try {
        if (row.booker_anon_id) {
          const { data } = await supabase.from('anonymous_bookers').select('name').eq('id', String(row.booker_anon_id)).maybeSingle()
          who = data?.name ?? ''
        } else if (row.booker_profile_id) {
          const { data } = await supabase.from('profiles').select('display_name').eq('id', String(row.booker_profile_id)).maybeSingle()
          who = data?.display_name ?? ''
        }
      } catch {
        /* the name is a nicety */
      }
      return [who, court, when].filter(Boolean).join(' · ')
    }

    // Alerts already raised this session, so the polling fallback and a late realtime
    // event for the same change never toast twice.
    const raised = new Set<string>()

    const handle = async (eventType: string, row: Row) => {
      const id = String(row.id)
      const status = String(row.status)
      const previous = lastStatus.get(id)
      lastStatus.set(id, status)

      let kind: AlertKind | null = null
      if (eventType === 'INSERT') kind = status === 'cancelled' ? null : 'new'
      else if (eventType === 'UPDATE') {
        if (status === 'cancelled' && previous !== 'cancelled') kind = 'cancelled'
        else if (status === 'confirmed' && previous !== 'confirmed') kind = 'paid'
      }
      if (!kind || cancelled) return
      if (raised.has(`${id}:${kind}`)) return
      raised.add(`${id}:${kind}`)

      const detail = await describe(row)
      if (cancelled) return
      push({ id: `${id}:${kind}`, kind, title: TITLE[kind], detail, at: Date.now(), read: false })
    }

    // Fallback when events do not arrive (socket down, blocked, or dropped under load):
    // ask the database for bookings changed since the last look. The cursor is a
    // server `updated_at` (never the browser clock), starting at the newest row at mount.
    let cursor: string | null = null
    let syncing = false
    const cursorReady = supabase
      .from('bookings')
      .select('updated_at')
      .eq('org_id', orgId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        cursor = data?.updated_at ?? new Date().toISOString()
      })

    const sync = async () => {
      if (syncing || cancelled) return
      syncing = true
      try {
        await cursorReady
        if (!cursor) return
        const { data, error } = await supabase
          .from('bookings')
          .select('id, court_id, starts_at, status, booker_profile_id, booker_anon_id, created_at, updated_at')
          .eq('org_id', orgId)
          .gt('updated_at', cursor)
          .order('updated_at', { ascending: true })
          .limit(20)
        if (error || !data?.length) return
        for (const row of data) {
          // A booking this session has not seen, created after the cursor, is new; otherwise a change.
          const isNew = !lastStatus.has(row.id) && row.created_at > cursor
          await handle(isNew ? 'INSERT' : 'UPDATE', row)
        }
        cursor = data[data.length - 1].updated_at
      } finally {
        syncing = false
      }
    }

    // The shared per-club feed: the bookings board listens to the same stream, and two
    // channels with the same subscription would starve one of them.
    const stop = subscribeToBookings(
      orgId,
      (change) => {
        if (change.eventType === 'DELETE') return
        void handle(change.eventType, change.new)
      },
      (status) => setLive(status === 'SUBSCRIBED'),
      () => void sync()
    )

    return () => {
      cancelled = true
      stop()
    }
  }, [orgId])

  const unread = alerts.filter((a) => !a.read).length

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        // Opening the list is reading it.
        if (next) setAlerts((prev) => prev.map((a) => ({ ...a, read: true })))
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-[#f7f5f2] hover:bg-[#f7f5f2]/10 hover:text-[#f7f5f2]"
          aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'}
          data-testid="alerts-bell"
        >
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              data-testid="alerts-unread"
              className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-[#26d862] px-1 text-[0.65rem] font-bold leading-4 text-[#2a1a1d]"
            >
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Alerts</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn('size-2 rounded-full', live ? 'bg-success' : 'bg-muted-foreground/40')} />
            {live ? 'Live' : 'Reconnecting · checking every 10 s'}
          </p>
        </div>
        {alerts.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            New bookings and cancellations appear here as they happen.
          </p>
        ) : (
          <ul aria-live="polite" className="max-h-80 divide-y divide-border overflow-y-auto">
            {alerts.map((a) => (
              <li key={a.id} className="px-4 py-3 text-sm" data-testid="alert-item">
                <p className="flex items-center justify-between gap-2 font-medium">
                  <span className={a.kind === 'cancelled' ? 'text-destructive' : undefined}>{a.title}</span>
                  <time className="text-xs font-normal text-muted-foreground" dateTime={new Date(a.at).toISOString()}>
                    {formatVenueTime(new Date(a.at))}
                  </time>
                </p>
                <p className="mt-0.5 text-muted-foreground">{a.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
