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
import { GoogleButton } from '@/components/auth/google-button'
import { CheckoutStepper, type CheckoutStep } from '@/components/booking/checkout-stepper'
import { CheckoutConfirmation, PaymentOptions, payNow } from '@/components/booking/checkout'
import { trackEvent } from '@/components/providers/posthog-provider'
import { createBooking, type BookingResult } from '@/lib/actions/booking'
import { canSplit, formatTND, type OnlineMode, type PaymentChoice } from '@/lib/payments'
import { formatVenueDate, formatVenueTime, minutesSinceVenueDayStart, timeSlotLabel, timeToMinutes } from '@/lib/court-time'
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
  /** Venue address and WhatsApp number, for the confirmation's calendar and contact buttons. */
  orgAddress?: string | null
  orgWhatsapp?: string | null
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
export function useIsDesktop() {
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
      aria-label="Récapitulatif du prix"
      className="rounded-lg bg-card p-4 text-card-foreground"
    >
      <dl className="space-y-2 text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-muted-foreground">
            Tarif du terrain
            <span className="block text-xs tabular-nums">
              Créneau de {slotHoursLabel(price.durationMinutes)} · {formatTND(slotPrice(selection.pricePerHour, price.durationMinutes))}
            </span>
          </dt>
          <dd className="font-medium tabular-nums">{formatTND(price.base)}</dd>
        </div>

        {price.surcharge > 0 && (
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">
              Supplément d&apos;éclairage de nuit
              <span className="block text-xs tabular-nums">
                Forfait pour les créneaux à partir de {selection.nightStartsAt.slice(0, 5)}
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
  orgAddress = null,
  orgWhatsapp = null,
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
  // Honeypot value (hidden field): stays empty for people.
  const [honeypot, setHoneypot] = React.useState('')
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
  const reserveLabel = choice === 'cash' ? 'Confirmer et réserver' : `Payer ${formatTND(dueNow)} et réserver`

  const meta = SPORT_META[selection.sport]
  const SportIcon = meta.icon
  const duration = SPORT_DURATION_MIN[selection.sport]

  // The 3-step flow. Everything the player enters lives in this component, so moving between
  // steps (or jumping back through the progress map) never loses it.
  const [step, setStep] = React.useState<CheckoutStep>(1)
  const [maxStep, setMaxStep] = React.useState<CheckoutStep>(1)
  const goTo = (next: CheckoutStep) => {
    if (next <= maxStep) {
      setError(null)
      setStep(next)
    }
  }
  const advance = (next: CheckoutStep) => {
    if (next === 3 && choice === 'split') {
      // A typo in an invite address is caught before the last step, not silently dropped by the server.
      const bad = Array.from({ length: playerCount - 1 }, (_, i) => (inviteEmails[i] ?? '').trim()).find(
        (e) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
      )
      if (bad) {
        setError(`« ${bad} » ne ressemble pas à une adresse e-mail. Corrigez-la ou laissez le champ vide.`)
        return
      }
    }
    setError(null)
    setStep(next)
    setMaxStep((m) => (next > m ? next : m))
    trackEvent('checkout.step_viewed', { step: next, club_id: orgId, payment: choice })
  }
  // A member has no form to fill in, but still accepts the Terms.
  const confirmAsMember = () => {
    if (!form.getValues('consent')) {
      form.setError('consent', { type: 'custom', message: 'Veuillez accepter les conditions d\'utilisation et la politique de confidentialité pour réserver' })
      return
    }
    void submit({ mode: 'member' })
  }
  const submit = async (
    who: { mode: 'member' } | { mode: 'guest'; guest: GuestFormOutput }
  ) => {
    // Typed-in invite addresses: a typo is caught here, not silently dropped by the server.
    // One entry per other player (the state array can have holes if a box was skipped).
    const invites = choice === 'split' ? Array.from({ length: playerCount - 1 }, (_, i) => (inviteEmails[i] ?? '').trim()) : []
    const bad = invites.find((e) => e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    if (bad) {
      setError(`« ${bad} » ne ressemble pas à une adresse e-mail. Corrigez-la ou laissez le champ vide.`)
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
      ...(honeypot ? { website: honeypot } : {}),
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
        trackEvent('booking.created', {
          booking_id: outcome.bookingId,
          club_id: orgId,
          court_id: selection.courtId,
          sport: selection.sport,
          date: selection.date,
          time_slot: timeSlotLabel(selection.startsAt, selection.endsAt),
          amount: outcome.amount,
          price: outcome.amount,
          payment: outcome.payment,
          status: outcome.status,
          actor: who.mode,
        })
        toast.success('Créneau réservé', { description: `Référence ${outcome.reference}` })
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
      const message = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
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
          orgAddress={orgAddress}
          orgWhatsapp={orgWhatsapp}
          sport={selection.sport}
          emailedTo={result.emailsEnabled ? sentTo.email : null}
          invitesEmailed={result.emailsEnabled ? sentTo.invites : 0}
          onDone={onClose}
        />
      </div>
    )
  }

  return (
    <>
      <CheckoutStepper step={step} maxStep={maxStep} onStep={goTo} disabled={submitting} />
      <div className="space-y-5 px-4 pb-6" data-step={step}>
        {step === 1 && (
          <>
            {/* ---- step 1: the court and slot ---- */}
            <section aria-label="Créneau sélectionné" className="space-y-3">
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
                  <dt className="text-xs text-muted-foreground">Heure</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">
                    {formatVenueTime(selection.startsAt)} – {formatVenueTime(selection.endsAt)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">Durée</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 font-medium tabular-nums">
                    <Badge variant="outline" className="gap-1">
                      <Clock aria-hidden />
                      {duration} min
                    </Badge>
                    <InfoTip label="À propos du battement">
                      Un battement de {BUFFER_MIN} min est laissé libre avant la réservation suivante : les créneaux commencent donc
                      toutes les {duration + BUFFER_MIN} min.
                    </InfoTip>
                  </dd>
                </div>
              </dl>

              {playerOptions.length > 1 && (
                <div role="group" aria-label="Nombre de joueurs" className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="size-3.5" aria-hidden />
                    Joueurs
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
                        'max-md:h-12 max-md:min-w-12',
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

            <Button type="button" data-testid="step-next" className="h-12 w-full text-base" onClick={() => advance(2)}>
              Continuer vers le paiement
            </Button>
          </>
        )}

        {step !== 1 && (
          <p className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm" data-testid="step-summary">
            <span className="min-w-0 truncate">
              <strong>{selection.courtName}</strong> · {formatVenueDate(selection.date)} ·{' '}
              <span className="tabular-nums">{formatVenueTime(selection.startsAt)}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{formatTND(price.total)}</span>
          </p>
        )}

        {step === 2 && (
          <>
            {/* ---- step 2: how to pay ---- */}
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
                  Envoyer les invitations par e-mail (facultatif)
                  <InfoTip label="À propos des e-mails d'invitation">
                    Nous pouvons envoyer à chaque joueur son lien de paiement par e-mail. Vous recevez aussi les liens à l&apos;écran suivant.
                  </InfoTip>
                </legend>
                {Array.from({ length: playerCount - 1 }, (_, i) => (
                  <Input
                    key={i}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    placeholder={`E-mail du joueur ${i + 2}`}
                    aria-label={`E-mail du joueur ${i + 2}`}
                    className="max-md:h-12"
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

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="grid grid-cols-[auto_1fr] gap-2">
              <Button type="button" variant="outline" className="h-12 px-5" onClick={() => goTo(1)}>
                Retour
              </Button>
              <Button type="button" data-testid="step-next" className="h-12 text-base" onClick={() => advance(3)}>
                Continuer
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {/* ---- step 3: who is booking, terms, confirm ---- */}
            {!member?.isMember && (
              <div className="space-y-3">
                <GoogleButton
                  orgId={orgId}
                  next={typeof window === 'undefined' ? undefined : window.location.pathname + window.location.search}
                />
                <p className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                  ou
                </p>
              </div>
            )}

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
                  J&apos;accepte les <LegalLinks />. J&apos;accepte que ShiftGrid et ce club utilisent mon nom et mon numéro de
                  téléphone pour gérer cette réservation et me contacter à ce sujet, y compris par e-mail (confirmation,
                  rappel, avis d&apos;annulation) si j&apos;en ai indiqué un, et par SMS ou appel téléphonique si nécessaire. Je
                  peux demander à tout moment l&apos;arrêt de ces contacts.
                </ConsentCheckbox>
              )}
            />

            <Tabs value={tab} onValueChange={(v) => setTab(v as 'member' | 'guest')}>
              <TabsList className="w-full">
                <TabsTrigger value="member" className="flex-1 max-md:min-h-12">
                  Membre
                </TabsTrigger>
                <TabsTrigger value="guest" className="flex-1 max-md:min-h-12">
                  Invité
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
                      <Badge variant="success" className="shrink-0 gap-1" title={`Membre de ${orgName}`}>
                        <ShieldCheck aria-hidden />
                        Membre · {orgName}
                      </Badge>
                    </div>
                    <Button className="h-12 w-full text-base" disabled={submitting} onClick={confirmAsMember}>
                      {submitting && <Loader2 className="animate-spin" aria-hidden />}
                      {reserveLabel}
                    </Button>
                  </>
                ) : member ? (
                  <>
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="min-w-0 truncate">
                        Connecté en tant que <strong>{member.displayName}</strong>
                      </span>
                      <InfoTip label="Pourquoi ne puis-je pas réserver en tant que membre ?">
                        La réservation en tant que membre est réservée aux joueurs inscrits auprès de {orgName}. Vous pouvez toujours réserver en tant qu&apos;invité.
                      </InfoTip>
                    </p>
                    <Button variant="outline" className="h-12 w-full" onClick={() => setTab('guest')}>
                      Réserver en tant qu&apos;invité
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" className="h-12 w-full" onClick={onRequestSignIn}>
                      Se connecter avec votre e-mail
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      Pas de compte ? Utilisez l&apos;onglet <strong>Invité</strong>.
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
                  {/* Honeypot: off-screen, unreachable by keyboard and screen readers; only bots fill it. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label htmlFor="guest-website">Site web</label>
                    <input
                      id="guest-website"
                      name="website"
                      type="text"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="guest-name">Nom complet</Label>
                    <Input
                      id="guest-name"
                      autoComplete="name"
                      placeholder="Ali Ben Salah"
                      className="max-md:h-12"
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
                      Numéro de mobile
                      <InfoTip label="À propos du numéro de mobile">
                        8 chiffres commençant par 2, 4, 5 ou 9. Le club l&apos;utilise pour vous joindre au sujet de cette réservation.
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
                        className="rounded-l-none max-md:h-12"
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
                      E-mail (facultatif)
                      <InfoTip label="À propos de l'e-mail">
                        Pour votre confirmation, un rappel deux heures avant et un avis d&apos;annulation. Non partagé.
                      </InfoTip>
                    </Label>
                    <Input
                      id="guest-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="vous@exemple.com"
                      className="max-md:h-12"
                      aria-invalid={!!form.formState.errors.email}
                      {...form.register('email')}
                    />
                    {form.formState.errors.email && (
                      <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                    )}
                  </div>

                  <Button type="submit" className="h-12 w-full text-base" disabled={submitting}>
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

            <Button type="button" variant="ghost" className="h-12 w-full" disabled={submitting} onClick={() => goTo(2)}>
              Retour au paiement
            </Button>
          </>
        )}
      </div>
    </>
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
          <SheetTitle>Réservez votre créneau</SheetTitle>
          <SheetDescription className="sr-only">
            Vérifiez les détails, puis confirmez. Votre créneau est retenu dès la réservation.
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
