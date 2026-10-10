'use client'

import * as React from 'react'
import Link from 'next/link'
import { motion, useReducedMotion } from 'framer-motion'
import { Banknote, Check, CreditCard, Link2, Loader2, Mail, ShieldAlert, Ticket, Users } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Disclosure } from '@/components/ui/disclosure'
import { InfoTip } from '@/components/ui/info-tip'
import { SPRING } from '@/components/ui/motion-button'
import { BookingActions } from '@/components/booking/booking-actions'
import { regenerateShareInviteAction } from '@/lib/actions/payments'
import type { BookingResult } from '@/lib/actions/booking'
import { formatVenueDate, formatVenueTime } from '@/lib/court-time'
import { canSplit, formatTND, splitShares, type OnlineMode, type PaymentChoice } from '@/lib/payments'
import { cn } from '@/lib/utils'

/* ==========================================================================
   Checkout pieces for the booking drawer (Milestone 9): the payment-method
   choice before booking, and the confirmation after it (pass link, split
   invites, guest cancel link).
   ========================================================================== */

const OPTION_META: Record<PaymentChoice, { title: string; icon: typeof CreditCard }> = {
  online_full: { title: 'Tout payer maintenant', icon: CreditCard },
  split: { title: 'Partager', icon: Users },
  cash: { title: 'Au club', icon: Banknote },
}

/** The amount charged right now for a choice (0 for cash). */
export function payNow(choice: PaymentChoice, total: number, playerCount: number): number {
  if (choice === 'online_full') return total
  if (choice === 'split') return splitShares(total, playerCount).organizer
  return 0
}

export function PaymentOptions({
  value,
  onChange,
  total,
  playerCount,
  onlineMode,
  disabled,
}: {
  value: PaymentChoice
  onChange: (choice: PaymentChoice) => void
  total: number
  playerCount: number
  onlineMode: OnlineMode
  disabled?: boolean
}) {
  const online = onlineMode !== 'disabled'
  const splitOk = canSplit(playerCount)
  const shares = splitOk ? splitShares(total, playerCount) : null

  // `chip` is the one-line summary shown on the card; `detail` is the full sentence, one tap away in the ⓘ.
  const options: { key: PaymentChoice; available: boolean; chip: string; detail: React.ReactNode; note?: string }[] = [
    {
      key: 'online_full',
      available: online,
      chip: formatTND(total),
      detail: <>Payez {formatTND(total)} maintenant. Votre réservation est confirmée immédiatement.</>,
      note: online ? undefined : 'Le paiement en ligne n\'est pas encore disponible.',
    },
    {
      key: 'split',
      available: online && splitOk,
      chip: shares ? `${formatTND(shares.organizer)} chacun` : 'à partager',
      detail: shares ? (
        <>
          Payez votre part de {formatTND(shares.organizer)} maintenant ({playerCount} joueurs). Vous recevez un lien pour
          chacun des {playerCount - 1} autres joueurs, qui paieront {formatTND(shares.others)}. Le créneau est retenu
          jusqu&apos;au paiement de toutes les parts.
        </>
      ) : (
        <>Payez votre part maintenant et envoyez un lien aux autres joueurs.</>
      ),
      note: !online ? 'Le paiement en ligne n\'est pas encore disponible.' : !splitOk ? 'Le partage fonctionne jusqu\'à 4 joueurs.' : undefined,
    },
    {
      key: 'cash',
      available: true,
      chip: 'espèces',
      detail: <>Payez {formatTND(total)} en espèces au club. Le personnel confirme votre paiement à votre arrivée.</>,
    },
  ]

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 flex w-full items-center gap-2 text-sm font-medium">
        Paiement
        {onlineMode === 'test' && value !== 'cash' && (
          <>
            <Badge variant="warning" className="px-1.5 py-0 text-[10px] tracking-wide">
              TEST
            </Badge>
            <InfoTip label="À propos du mode test">
              <strong>Mode test :</strong> aucune passerelle de paiement réelle n&apos;est connectée, aucun argent n&apos;est
              débité. Le paiement est enregistré comme payé pour les besoins du test.
            </InfoTip>
          </>
        )}
      </legend>
      {options.map(({ key, available, chip, detail, note }) => {
        const { title, icon: Icon } = OPTION_META[key]
        const selected = value === key
        return (
          <label
            key={key}
            className={cn(
              'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
              selected ? 'border-forest-depths bg-card' : 'border-border hover:bg-card/60',
              !available && 'cursor-not-allowed opacity-55 hover:bg-transparent'
            )}
          >
            <input
              type="radio"
              name="payment"
              value={key}
              checked={selected}
              disabled={!available}
              onChange={() => onChange(key)}
              className="size-4 shrink-0 accent-[#1d3023]"
            />
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">
                {title} <span className="font-normal text-muted-foreground">·</span>{' '}
                <span className="tabular-nums">{available ? chip : (note ? 'indisponible' : chip)}</span>
              </span>
            </span>
            <InfoTip label={`À propos : ${title}`}>{note ?? detail}</InfoTip>
          </label>
        )
      })}
    </fieldset>
  )
}

/* ------------------------------- link helpers ------------------------------ */

function useCopy() {
  const [copied, setCopied] = React.useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000)
    } catch {
      toast.error('Copie impossible. Sélectionnez le lien et copiez-le manuellement.')
    }
  }
  return { copied, copy }
}

const absolute = (path: string) => (typeof window === 'undefined' ? path : `${window.location.origin}${path}`)

/** The guest's only way to cancel online, so it is shown prominently and copyable. */
export function GuestCancelLink({ path }: { path: string }) {
  const { copied, copy } = useCopy()
  const url = absolute(path)
  return (
    <Disclosure title="Lien d'annulation (à garder privé)" icon={<Link2 className="size-4 text-muted-foreground" aria-hidden />}>
      <p>
        C&apos;est le seul moyen d&apos;annuler en ligne sans compte, gratuitement jusqu&apos;à 24 heures avant votre
        créneau. Toute personne disposant du lien peut annuler : gardez-le privé.
      </p>
      <input
        readOnly
        value={url}
        aria-label="Lien d'annulation"
        onFocus={(e) => e.currentTarget.select()}
        className="ph-no-capture w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs text-foreground"
      />
      <Button type="button" variant="outline" size="sm" onClick={() => copy('cancel', url)}>
        {copied === 'cancel' ? 'Copié' : 'Copier le lien'}
      </Button>
    </Disclosure>
  )
}

export function InviteLinks({
  invites,
  bookingId,
  guestToken,
}: {
  invites: { shareNo: number; amount: number; path: string }[]
  /** When given, each row can mint a replacement link (pass page). */
  bookingId?: string
  guestToken?: string | null
}) {
  const { copied, copy } = useCopy()
  const [links, setLinks] = React.useState(invites)
  const [busy, setBusy] = React.useState<number | null>(null)

  const regenerate = async (shareNo: number) => {
    if (!bookingId) return
    setBusy(shareNo)
    const res = await regenerateShareInviteAction({ bookingId, shareNo, guestToken: guestToken ?? undefined })
    setBusy(null)
    if (!res.ok) return void toast.error(res.message)
    setLinks((prev) => prev.map((l) => (l.shareNo === shareNo ? { ...l, path: res.path } : l)))
    toast.success('Nouveau lien créé. L\'ancien ne fonctionne plus.')
  }

  return (
    <ul className="space-y-3">
      {links.map((l) => {
        const url = absolute(l.path)
        return (
          <li key={l.shareNo} className="rounded-lg border border-border p-3 text-sm">
            <p className="font-medium">
              Joueur {l.shareNo} <span className="font-normal text-muted-foreground">paie {formatTND(l.amount)}</span>
            </p>
            <input
              readOnly
              value={url}
              aria-label={`Lien de paiement du joueur ${l.shareNo}`}
              onFocus={(e) => e.currentTarget.select()}
              className="ph-no-capture mt-2 w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
            />
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => copy(`s${l.shareNo}`, url)}>
                {copied === `s${l.shareNo}` ? 'Copié' : 'Copier le lien'}
              </Button>
              {bookingId && (
                <Button type="button" variant="ghost" size="sm" disabled={busy === l.shareNo} onClick={() => regenerate(l.shareNo)}>
                  {busy === l.shareNo && <Loader2 className="animate-spin" aria-hidden />}
                  Nouveau lien
                </Button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/* ------------------------------- confirmation ------------------------------ */

export function CheckoutConfirmation({
  courtName,
  date,
  result,
  orgName,
  orgAddress = null,
  orgWhatsapp = null,
  sport,
  emailedTo = null,
  invitesEmailed = 0,
  onDone,
}: {
  courtName: string
  date: string
  result: Extract<BookingResult, { ok: true }>
  orgName: string
  sport: string
  orgAddress?: string | null
  orgWhatsapp?: string | null
  /** The address a confirmation is being emailed to (only when email is configured). */
  emailedTo?: string | null
  /** How many other players are being emailed their payment link. */
  invitesEmailed?: number
  onDone: () => void
}) {
  const reduce = useReducedMotion()
  const split = result.payment === 'split'
  const confirmed = result.status === 'confirmed'
  const remaining = Math.max(0, result.amount - result.paidNow)

  const headline = confirmed ? 'Réservation confirmée' : split ? 'Créneau retenu, en attente de vos joueurs' : 'Votre créneau est réservé'
  const sub = confirmed
    ? `Payé en totalité · présentez le code à ${orgName}`
    : split
      ? 'Confirmé dès que toutes les parts sont payées'
      : `Paiement à ${orgName} · présentez le code`

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
          <h3 className="text-xl font-semibold">{headline}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{sub}</p>
        </div>
      </div>

      <div className="rounded-lg bg-card p-4 text-center">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Référence</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{result.reference}</p>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Terrain</dt>
          <dd className="font-medium">{courtName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Quand</dt>
          <dd className="font-medium tabular-nums">
            {formatVenueDate(date)}, {formatVenueTime(result.startsAt)} – {formatVenueTime(result.endsAt)}
          </dd>
        </div>
        {result.paidNow > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Payé maintenant</dt>
            <dd className="font-semibold tabular-nums">{formatTND(result.paidNow)}</dd>
          </div>
        )}
        {(result.payment === 'cash' || split) && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{split ? 'Reste à payer par vos joueurs' : 'À payer au club'}</dt>
            <dd className="font-semibold tabular-nums">{formatTND(split ? remaining : result.amount)}</dd>
          </div>
        )}
      </dl>

      {result.highRisk && (
        <p role="note" data-testid="risk-notice" className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            Merci d&apos;arriver à l&apos;heure : {orgName} peut demander un acompte à l&apos;accueil, et une réservation non
            honorée est enregistrée sur votre compte. Annulez à l&apos;avance si vos plans changent.
          </span>
        </p>
      )}

      {(emailedTo || invitesEmailed > 0) && (
        <p className="ph-mask flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-sm text-muted-foreground">
          <Mail className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {emailedTo && <strong className="break-all font-medium text-foreground">{emailedTo}</strong>}
            {emailedTo && invitesEmailed > 0 && ' · '}
            {invitesEmailed > 0 && `${invitesEmailed} ${invitesEmailed === 1 ? 'invitation envoyée' : 'invitations envoyées'}`}
          </span>
        </p>
      )}

      {split && result.invites.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-sm font-medium">
            Liens des joueurs
            <InfoTip label="À propos des liens de paiement">
              Chaque lien ne fonctionne qu&apos;une fois. Retrouvez votre réservation plus tard dans Mes réservations et créez
              un nouveau lien si l&apos;un d&apos;eux est perdu.
            </InfoTip>
          </p>
          <InviteLinks invites={result.invites} />
        </div>
      )}

      <BookingActions
        bookingId={result.bookingId}
        clubName={orgName}
        courtName={courtName}
        sport={sport}
        date={formatVenueDate(date)}
        time={`${formatVenueTime(result.startsAt)} – ${formatVenueTime(result.endsAt)}`}
        startsAt={result.startsAt}
        endsAt={result.endsAt}
        reference={result.reference}
        address={orgAddress}
        whatsappNumber={orgWhatsapp}
      />

      {result.cancelPath && <GuestCancelLink path={result.cancelPath} />}

      <div className="grid gap-2">
        <Button asChild variant="outline" className="h-11 w-full">
          <Link href={result.passPath}>
            <Ticket aria-hidden />
            Voir votre pass
          </Link>
        </Button>
        <Button className="h-11 w-full" onClick={onDone}>
          Terminé
        </Button>
      </div>
    </motion.div>
  )
}
