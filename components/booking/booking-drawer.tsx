'use client'

import * as React from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  Calendar,
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
import { InfoTip } from '@/components/ui/info-tip'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckoutConfirmation, PaymentOptions, payNow } from '@/components/booking/checkout'
import { trackEvent } from '@/components/providers/posthog-provider'
import { createBooking, type BookingResult } from '@/lib/actions/booking'
import { canSplit, formatTND, type OnlineMode, type PaymentChoice } from '@/lib/payments'
import { formatVenueDate, formatVenueTime, minutesSinceVenueDayStart, timeToMinutes } from '@/lib/court-time'
import { computePrice, slotHoursLabel, slotPrice } from '@/lib/pricing'
import { BUFFER_MIN, PLAYER_COUNT_OPTIONS, SPORT_DURATION_MIN, type Sport } from '@/lib/slot-duration'
import { guestBookingFormSchema } from '@/lib/validations/booking'
import { ConsentCheckbox, LegalLinks } from '@/components/legal/consent-checkbox'
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
  /** Whether online / split payment can be taken (decided on the server). */
  onlineMode?: OnlineMode
}

const SPORT_META: Record<Sport, { label: string; icon: typeof Zap }> = {
  padel: { label: 'Padel', icon: Zap },
  tennis: { label: 'Tennis', icon: Trophy },
  football: { label: 'Football', icon: Calendar },
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

type GuestFormInput = z.input<typeof guestBookingFormSchema>
type GuestFormOutput = z.output<typeof guestBookingFormSchema>

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
              {slotHoursLabel(price.durationMinutes)} slot · {formatTND(slotPrice(selection.pricePerHour, price.durationMinutes))}
            </span>
          </dt>
          <dd className="font-medium tabular-nums">{formatTND(price.base)}</dd>
        </div>

        {price.surcharge > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">
              Night lighting surcharge
              <span className="block text-xs tabular-nums">
                Flat fee for slots from {selection.nightStartsAt.slice(0, 5)}
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
    </section>
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
  onlineMode = 'disabled',
}: Omit<BookingDrawerProps, 'open' | 'onOpenChange' | 'selection'> & {
  selection: BookingDrawerSelection
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}) {
  const [tab, setTab] = React.useState<'member' | 'guest'>(member?.isMember ? 'member' : 'guest')
  const playerOptions = PLAYER_COUNT_OPTIONS[selection.sport] as readonly number[]
  const [playerCount, setPlayerCount] = React.useState<number>(playerOptions[0])
  const [payment, setPayment] = React.useState<PaymentChoice>('cash')
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  // Split only: where to email each other player's payment link (all optional).
  const [inviteEmails, setInviteEmails] = React.useState<string[]>([])
  const [sentTo, setSentTo] = React.useState<{ email: string | null; invites: number }>({ email: null, invites: 0 })
  const [result, setResult] = React.useState<Extract<BookingResult, { ok: true }> | null>(null)

  const form = useForm<GuestFormInput, unknown, GuestFormOutput>({
    resolver: zodResolver(guestBookingFormSchema),
    defaultValues: { fullName: '', phone: '', email: '', consent: false },
    mode: 'onTouched',
  })

  // A split needs 2 to 4 players; if the player count changes under it, fall back to cash.
  const choice: PaymentChoice = payment === 'split' && !canSplit(playerCount) ? 'cash' : payment
  const price = computePrice({
    pricePerHour: selection.pricePerHour,
    nightSurchargePerHour: selection.nightSurchargePerHour,
    nightStartsAtMinutes: timeToMinutes(selection.nightStartsAt),
    startMinutes: minutesSinceVenueDayStart(selection.startsAt, selection.date),
    durationMinutes: SPORT_DURATION_MIN[selection.sport],
  })
  const dueNow = payNow(choice, price.total, playerCount)
  const reserveLabel = choice === 'cash' ? 'Confirm & Reserve' : `Pay ${formatTND(dueNow)} & Reserve`

  const meta = SPORT_META[selection.sport]
  const SportIcon = meta.icon
  const duration = SPORT_DURATION_MIN[selection.sport]

  const submit = async (
    who: { mode: 'member' } | { mode: 'guest'; guest: GuestFormOutput }
  ) => {
    // Typed-in invite addresses: a typo is caught here, not silently dropped by the server.
    // One entry per other player (the state array can have holes if a box was skipped).
    const invites = choice === 'split' ? Array.from({ length: playerCount - 1 }, (_, i) => (inviteEmails[i] ?? '').trim()) : []
    const bad = invites.find((e) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (bad) {
      setError(`"${bad}" does not look like an email address. Fix it or leave it blank.`)
      return
    }

    setSubmitting(true)
    onBusyChange(true)
    setError(null)

    const base = {
      orgId,
      courtId: selection.courtId,
      date: selection.date,
      startsAt: selection.startsAt,
      playerCount,
      payment: choice,
      ...(invites.some(Boolean) ? { inviteEmails: invites } : {}),
    }

    try {
      const outcome = await createBooking(
        who.mode === 'member' ? { mode: 'member', ...base } : {
            mode: 'guest',
            ...base,
            guest: { fullName: who.guest.fullName, phone: who.guest.phone, email: who.guest.email },
            consent: who.guest.consent,
          }
      )

      if (outcome.ok) {
        setSentTo({
          email: who.mode === 'guest' ? (who.guest.email ?? null) : (member?.email ?? null),
          invites: invites.filter(Boolean).length,
        })
        setResult(outcome)
        trackEvent('booking.created', { booking_id: outcome.bookingId, payment: outcome.payment, status: outcome.status, amount: outcome.amount, actor: who.mode })
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
        <CheckoutConfirmation
          courtName={selection.courtName}
          date={selection.date}
          result={result}
          orgName={orgName}
          emailedTo={result.emailsEnabled ? sentTo.email : null}
          invitesEmailed={result.emailsEnabled ? sentTo.invites : 0}
          onDone={onClose}
        />
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
            <dt className="text-xs text-muted-foreground">Duration</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
              <Badge variant="outline" className="gap-1">
                <Clock aria-hidden />
                {duration} min
              </Badge>
              <InfoTip label="About the changeover">
                {BUFFER_MIN} min changeover is kept free before the next booking, so slots start {duration + BUFFER_MIN} min
                apart.
              </InfoTip>
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

      <PaymentOptions
        value={choice}
        onChange={setPayment}
        total={price.total}
        playerCount={playerCount}
        onlineMode={onlineMode}
        disabled={submitting}
      />

      {choice === 'split' && (
        <fieldset className="space-y-2" disabled={submitting}>
          <legend className="flex items-center gap-1 text-sm font-medium">
            Email the invites (optional)
            <InfoTip label="About the invite emails">
              We can email each player their payment link. You also get the links on the next screen.
            </InfoTip>
          </legend>
          {Array.from({ length: playerCount - 1 }, (_, i) => (
            <Input
              key={i}
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder={`Player ${i + 2} email`}
              aria-label={`Email for player ${i + 2}`}
              value={inviteEmails[i] ?? ''}
              onChange={(e) =>
                setInviteEmails((prev) => {
                  const next = [...prev]
                  next[i] = e.target.value
                  return next
                })
              }
            />
          ))}
        </fieldset>
      )}

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
                <Badge variant="success" className="shrink-0 gap-1" title={`Member of ${orgName}`}>
                  <ShieldCheck aria-hidden />
                  Member · {orgName}
                </Badge>
              </div>
              <Button
                className="h-11 w-full"
                disabled={submitting}
                onClick={() => submit({ mode: 'member' })}
              >
                {submitting && <Loader2 className="animate-spin" aria-hidden />}
                {reserveLabel}
              </Button>
            </>
          ) : member ? (
            <>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="min-w-0 truncate">
                  Signed in as <strong>{member.displayName}</strong>
                </span>
                <InfoTip label="Why can't I book as a member?">
                  Member booking is only available to players registered with {orgName}. You can still book as a guest.
                </InfoTip>
              </p>
              <Button variant="outline" className="h-11 w-full" onClick={() => setTab('guest')}>
                Book as a guest instead
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="h-11 w-full" onClick={onRequestSignIn}>
                Sign in for one-tap booking
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                No account? Use the <strong>Guest</strong> tab.
              </p>
            </>
          )}
        </TabsContent>

        {/* ph-no-capture: guest name/phone/email never appear in session recordings (inputs are masked anyway). */}
        <TabsContent value="guest" className="ph-no-capture mt-4">
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
              <Label htmlFor="guest-phone" className="flex items-center gap-1">
                Mobile number
                <InfoTip label="About the mobile number">
                  8 digits starting with 2, 4, 5 or 9. The club uses it to reach you about this booking.
                </InfoTip>
              </Label>
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
                  aria-describedby={form.formState.errors.phone ? 'guest-phone-error' : undefined}
                  {...form.register('phone')}
                />
              </div>
              {form.formState.errors.phone && (
                <p id="guest-phone-error" className="text-sm text-destructive">
                  {form.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guest-email" className="flex items-center gap-1">
                Email (optional)
                <InfoTip label="About the email">
                  For your confirmation, a reminder two hours before, and a cancellation notice. Not shared.
                </InfoTip>
              </Label>
              <Input
                id="guest-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>

            <Controller
              name="consent"
              control={form.control}
              render={({ field }) => (
                <ConsentCheckbox
                  id="guest-consent"
                  checked={!!field.value}
                  onChange={field.onChange}
                  error={form.formState.errors.consent?.message}
                >
                  I accept the <LegalLinks />. I agree that ShiftGrid and this club may use my name and phone number to manage
                  this booking and contact me about it, including by email (confirmation, reminder, cancellation notice) if I
                  gave one, and by SMS or phone call if needed. I can ask to stop at any time.
                </ConsentCheckbox>
              )}
            />

            <Button type="submit" className="h-11 w-full" disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" aria-hidden />}
              {reserveLabel}
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
          <SheetDescription className="sr-only">
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
