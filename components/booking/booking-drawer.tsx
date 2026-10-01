'use client'

import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  Calendar,
  Check,
  Clock,
  Loader2,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
  Zap,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SPRING } from '@/components/ui/motion-button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createBooking, type BookingResult } from '@/lib/actions/booking'
import { formatVenueDate, formatVenueTime, minutesSinceVenueDayStart, timeToMinutes } from '@/lib/court-time'
import { computePrice } from '@/lib/pricing'
import { BUFFER_MIN, PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { guestDetailsSchema } from '@/lib/validations/booking'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Booking drawer (Milestone 4).
   Right-hand sheet on desktop, bottom sheet on mobile. Two ways to book:
   a signed-in club member (one tap) or a guest (name + Tunisian mobile).
   The price shown here comes from the same `computePrice` the server action
   uses, and the server recomputes it from the database before charging.
   ========================================================================== */

export interface BookingDrawerSelection {
  courtId: string
  courtName: string
  sport: Sport
  /** Venue calendar day the slot belongs to, YYYY-MM-DD. */
  date: string
  /** ISO instants for start and end of play. */
  startsAt: string
  endsAt: string
  pricePerHour: number
  nightSurchargePerHour: number
  /** Postgres TIME, e.g. "18:00:00". */
  nightStartsAt: string
}

export interface BookingDrawerMember {
  displayName: string
  email: string | null
  phone: string | null
  /** The account's role, e.g. "player" or "staff". */
  role: string
  /** True only for a player account registered with THIS club. */
  isMember: boolean
}

export interface BookingDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  orgName: string
  selection: BookingDrawerSelection | null
  /** null when nobody is signed in. */
  member: BookingDrawerMember | null
  /** Opens the sign-in / sign-up dialog. */
  onRequestSignIn: () => void
  /** A booking was created: refresh availability. */
  onBooked?: () => void
  /** The slot turned out to be unavailable: refresh availability. */
  onSlotUnavailable?: () => void
}

const SPORT_META: Record<Sport, { label: string; icon: typeof Zap }> = {
  padel: { label: 'Padel', icon: Zap },
  tennis: { label: 'Tennis', icon: Trophy },
  football: { label: 'Football', icon: Calendar },
}

function formatTND(amount: number) {
  return `${Number.isInteger(amount) ? amount : amount.toFixed(2)} TND`
}

/** Bottom sheet on phones, right-hand sheet from the `md` breakpoint up. */
function useIsDesktop() {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia('(min-width: 768px)')
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia('(min-width: 768px)').matches,
    () => false
  )
}

type GuestFormInput = z.input<typeof guestDetailsSchema>
type GuestFormOutput = z.output<typeof guestDetailsSchema>

/* ------------------------------ price summary ----------------------------- */

export function PriceSummary({ selection }: { selection: BookingDrawerSelection }) {
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })

  return (
    <section
      aria-label="Price summary"
      className="rounded-lg bg-card p-4 text-card-foreground"
    >
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">
            Court fee
            <span className="block text-xs tabular-nums">
              {price.durationMinutes} min × {formatTND(selection.pricePerHour)}/h
            </span>
          </dt>
          <dd className="font-medium tabular-nums">{formatTND(price.base)}</dd>
        </div>

        {price.surcharge > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">
              Night lighting surcharge
              <span className="block text-xs tabular-nums">
                {price.surchargeMinutes} min after {selection.nightStartsAt.slice(0, 5)} ×{' '}
                {formatTND(selection.nightSurchargePerHour)}/h
              </span>
            </dt>
            <dd className="font-medium tabular-nums">{formatTND(price.surcharge)}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-border pt-3">
        <span className="text-sm font-medium">Total</span>
        <span className="text-2xl font-bold tabular-nums tracking-tight">
          {formatTND(price.total)}
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Pay at the club. No online payment is taken yet.
      </p>
    </section>
  )
}

/* ------------------------------- confirmation ----------------------------- */

/** The guest's only way to cancel online, so it is shown prominently and copyable. */
function GuestCancelLink({ path }: { path: string }) {
  const [copied, setCopied] = React.useState(false)
  const url = typeof window === 'undefined' ? path : `${window.location.origin}${path}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy. Select the link and copy it by hand.')
    }
  }

  return (
    <div className="rounded-lg border border-border p-4 text-sm">
      <p className="font-medium">Need to cancel? Save this link.</p>
      <p className="mt-1 text-muted-foreground">
        It is the only way to cancel online without an account, free until 24 hours before your slot.
        Anyone with the link can cancel, so keep it private.
      </p>
      <input
        readOnly
        value={url}
        aria-label="Cancellation link"
        onFocus={(e) => e.currentTarget.select()}
        className="mt-3 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
      />
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={copy}>
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}

function Confirmation({
  selection,
  result,
  orgName,
  onDone,
}: {
  selection: BookingDrawerSelection
  result: Extract<BookingResult, { ok: true }>
  orgName: string
  onDone: () => void
}) {
  const reduce = useReducedMotion()

  return (
    <motion.div
      role="status"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING}
      className="space-y-5"
    >
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
          <Check className="size-6" aria-hidden />
        </span>
        <div>
          <h3 className="text-xl font-semibold">Your slot is reserved</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Show this code at {orgName}.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-card p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Reference
        </p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">
          {result.reference}
        </p>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Court</dt>
          <dd className="font-medium">{selection.courtName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">When</dt>
          <dd className="font-medium tabular-nums">
            {formatVenueDate(selection.date)}, {formatVenueTime(result.startsAt)} –{' '}
            {formatVenueTime(result.endsAt)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">To pay at the club</dt>
          <dd className="font-semibold tabular-nums">{formatTND(result.amount)}</dd>
        </div>
      </dl>

      {result.cancelPath && <GuestCancelLink path={result.cancelPath} />}

      <Button className="h-11 w-full" onClick={onDone}>
        Done
      </Button>
    </motion.div>
  )
}

/* --------------------------------- body ---------------------------------- */

export function DrawerBody({
  orgId,
  orgName,
  selection,
  member,
  onRequestSignIn,
  onClose,
  onBooked,
  onSlotUnavailable,
  onBusyChange,
}: Omit<BookingDrawerProps, 'open' | 'onOpenChange' | 'selection'> & {
  selection: BookingDrawerSelection
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [tab, setTab] = React.useState<'member' | 'guest'>(member?.isMember ? 'member' : 'guest')
  const playerOptions = PLAYER_COUNT_OPTIONS[selection.sport] as readonly number[]
  const [playerCount, setPlayerCount] = React.useState<number>(playerOptions[0])
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<Extract<BookingResult, { ok: true }> | null>(null)

  const form = useForm<GuestFormInput, unknown, GuestFormOutput>({
    resolver: zodResolver(guestDetailsSchema),
    defaultValues: { fullName: '', phone: '' },
    mode: 'onTouched',
  })

  const meta = SPORT_META[selection.sport]
  const SportIcon = meta.icon
  const duration = SPORT_DURATION_MIN[selection.sport]

  const submit = async (
    who: { mode: 'member' } | { mode: 'guest'; guest: GuestFormOutput }
  ) => {
    setSubmitting(true)
    onBusyChange(true)
    setError(null)

    const base = {
      orgId,
      courtId: selection.courtId,
      date: selection.date,
      startsAt: selection.startsAt,
      playerCount,
    }

    try {
      const outcome = await createBooking(
        who.mode === 'member' ? { mode: 'member', ...base } : { mode: 'guest', ...base, guest: who.guest }
      )

      if (outcome.ok) {
        setResult(outcome)
        toast.success('Slot reserved', { description: `Reference ${outcome.reference}` })
        onBooked?.()
        return
      }

      setError(outcome.message)
      // A clean, specific toast; the race-condition case is the important one.
      toast.error(outcome.message)
      if (['slot_taken', 'slot_in_past', 'unavailable', 'invalid_slot'].includes(outcome.code)) {
        onSlotUnavailable?.()
      }
    } catch {
      const message = 'We could not reach the server. Please check your connection and try again.'
      setError(message)
      toast.error(message)
    } finally {
      setSubmitting(false)
      onBusyChange(false)
    }
  }

  if (result) {
    return (
      <div className="px-4 pb-6">
        <Confirmation selection={selection} result={result} orgName={orgName} onDone={onClose} />
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 pb-6">
      {/* ---- slot summary ---- */}
      <section aria-label="Selected slot" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{orgName}</span>
            </p>
            <p className="mt-0.5 text-lg font-semibold leading-tight">{selection.courtName}</p>
          </div>
          <Badge variant="secondary" className="shrink-0 gap-1">
            <SportIcon aria-hidden />
            {meta.label}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Date</dt>
            <dd className="mt-0.5 font-medium">{formatVenueDate(selection.date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Time</dt>
            <dd className="mt-0.5 font-medium tabular-nums">
              {formatVenueTime(selection.startsAt)} – {formatVenueTime(selection.endsAt)}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Total duration</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
              <Clock className="size-3.5 text-muted-foreground" aria-hidden />
              {duration} min
              <span className="text-xs font-normal text-muted-foreground">
                (+{BUFFER_MIN} min changeover before the next booking)
              </span>
            </dd>
          </div>
        </dl>

        {playerOptions.length > 1 && (
          <div role="group" aria-label="Number of players" className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="size-3.5" aria-hidden />
              Players
            </span>
            {playerOptions.map((count) => (
              <Button
                key={count}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={playerCount === count}
                onClick={() => setPlayerCount(count)}
                className={cn(
                  playerCount === count &&
                    'border-forest-depths bg-forest-depths text-bone-linen hover:bg-forest-depths/90 hover:text-bone-linen'
                )}
              >
                {count}
              </Button>
            ))}
          </div>
        )}
      </section>

      <PriceSummary selection={selection} />

      {/* ---- who is booking ---- */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'member' | 'guest')}>
        <TabsList className="w-full">
          <TabsTrigger value="member" className="flex-1">
            Member
          </TabsTrigger>
          <TabsTrigger value="guest" className="flex-1">
            Guest
          </TabsTrigger>
        </TabsList>

        <TabsContent value="member" className="mt-4 space-y-4">
          {member?.isMember ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
                  aria-hidden
                >
                  {member.displayName.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{member.displayName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[member.email, member.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <Badge variant="success" className="shrink-0 gap-1">
                  <ShieldCheck aria-hidden />
                  Member
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                You&apos;re a member of {orgName}. Your details are on file, so there is nothing
                to fill in.
              </p>
              <Button
                className="h-11 w-full"
                disabled={submitting}
                onClick={() => submit({ mode: 'member' })}
              >
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                Confirm &amp; Reserve
              </Button>
            </>
          ) : member ? (
            <>
              <p className="text-sm text-muted-foreground">
                You&apos;re signed in as <strong>{member.displayName}</strong> ({member.role}).
                Member booking is only available to players registered with {orgName}.
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={() => setTab('guest')}>
                Book as a guest instead
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in to book with your member profile. It takes one tap and your details are
                remembered.
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={onRequestSignIn}>
                Sign in or create an account
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No account? Use the <strong>Guest</strong> tab.
              </p>
            </>
          )}
        </TabsContent>

        <TabsContent value="guest" className="mt-4">
          <form
            noValidate
            onSubmit={form.handleSubmit((guest) => submit({ mode: 'guest', guest }))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Full name</Label>
              <Input
                id="guest-name"
                autoComplete="name"
                placeholder="Ali Ben Salah"
                aria-invalid={!!form.formState.errors.fullName}
                aria-describedby={form.formState.errors.fullName ? 'guest-name-error' : undefined}
                {...form.register('fullName')}
              />
              {form.formState.errors.fullName && (
                <p id="guest-name-error" className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-phone">Mobile number</Label>
              <div className="flex">
                <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                  +216
                </span>
                <Input
                  id="guest-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98 123 456"
                  className="rounded-l-none"
                  aria-invalid={!!form.formState.errors.phone}
                  aria-describedby={
                    form.formState.errors.phone ? 'guest-phone-error' : 'guest-phone-hint'
                  }
                  {...form.register('phone')}
                />
              </div>
              {form.formState.errors.phone ? (
                <p id="guest-phone-error" className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              ) : (
                <p id="guest-phone-hint" className="text-xs text-muted-foreground">
                  8 digits starting with 2, 4, 5 or 9. The club uses it to reach you about this
                  booking.
                </p>
              )}
            </div>

            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              Confirm &amp; Reserve
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

/* --------------------------------- drawer -------------------------------- */

export function BookingDrawer({
  open,
  onOpenChange,
  selection,
  ...rest
}: BookingDrawerProps) {
  const isDesktop = useIsDesktop()
  const [busy, setBusy] = React.useState(false)

  return (
    <Sheet
      open={open}
      // Ignore dismissal while a booking request is in flight.
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={cn(
          'overflow-y-auto',
          isDesktop ? 'w-full sm:max-w-md' : 'max-h-[92dvh] rounded-t-xl'
        )}
      >
        <SheetHeader>
          <SheetTitle>Reserve your slot</SheetTitle>
          <SheetDescription>
            Check the details, then confirm. Your slot is held the moment you book.
          </SheetDescription>
        </SheetHeader>

        {selection && (
          <DrawerBody
            // A new slot starts from a clean form and state.
            key={`${selection.courtId}-${selection.startsAt}`}
            selection={selection}
            onClose={() => onOpenChange(false)}
            onBusyChange={setBusy}
            {...rest}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}

export default BookingDrawer
