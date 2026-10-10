import { formatTND } from '@/lib/payments'
import { googleCalendarUrl, type CalendarEvent } from '@/lib/calendar'
import type { EmailAttachment } from '@/lib/notifications/mailer'

/**
 * Transactional email templates. Pure: data in, `{ subject, html, text }` out, so they
 * are testable without sending anything.
 *
 * Everything that came from a user (a guest's name, a cancellation reason, a club
 * name) goes through `esc()` before it reaches HTML. Links are built by the caller
 * from our own origin; `safeUrl()` still refuses anything that is not http(s).
 * Styling is inline because email clients ignore stylesheets. Colours follow the
 * app (Forest Depths / Bone Linen / Peacock Teal).
 */

export type Rendered = { subject: string; html: string; text: string; attachments?: EmailAttachment[] }

/** The content id the check-in QR image is attached under (`<img src="cid:...">`). */
export const CHECK_IN_QR_CID = 'checkin-qr'

/** What every booking email says about the booking. All strings are display-ready (venue time). */
export type BookingFacts = {
  clubName: string
  courtName: string
  sport: string
  /** e.g. "mar. 3 nov. 2026" */
  date: string
  /** e.g. "18:00 – 19:30" */
  time: string
  reference: string
  /** Total price in TND. */
  amount: number
  playerCount: number
  /** Real slot instants + venue + booking id: lets the email offer "Add to calendar". Optional. */
  calendar?: CalendarEvent | null
  /** `https://wa.me/...` link to the club (or the platform fallback), with the booking pre-filled. Optional. */
  whatsappUrl?: string | null
}

export type PaymentState = 'confirmed' | 'pay_at_club' | 'awaiting_shares'

const FOREST = '#1d3023'
const BONE = '#f7f5f2'
const OAT = '#eae6df'
const TEAL = '#0e634f'
const INK = '#2a1a1d'
const ASH = '#645757'

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#'
}

function sportLabel(sport: string): string {
  return sport ? sport.charAt(0).toUpperCase() + sport.slice(1) : 'Terrain'
}

function button(label: string, url: string): string {
  return `<p style="margin:24px 0 0"><a href="${esc(safeUrl(url))}" style="display:inline-block;background:${FOREST};color:${BONE};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px">${esc(label)}</a></p>`
}

/** WhatsApp + Google Calendar links under the main button. The .ics file is attached by the sender. */
function contactBlock(f: BookingFacts, opts: { icsAttached: boolean }): string {
  const links: string[] = []
  if (f.whatsappUrl) {
    links.push(`<a href="${esc(safeUrl(f.whatsappUrl))}" style="display:inline-block;border:1px solid ${FOREST};color:${FOREST};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0">Contacter le club sur WhatsApp</a>`)
  }
  if (f.calendar) {
    links.push(`<a href="${esc(safeUrl(googleCalendarUrl(f.calendar)))}" style="display:inline-block;border:1px solid ${FOREST};color:${FOREST};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;margin:0 8px 8px 0">Ajouter à Google Agenda</a>`)
  }
  if (links.length === 0) return ''
  const ics = f.calendar && opts.icsAttached ? `<p style="margin:0;font-size:13px;color:${ASH}">Apple Calendar / Outlook : ouvrez le fichier joint <strong>booking.ics</strong>.</p>` : ''
  return `<div style="margin:20px 0 0">${links.join('')}${ics}</div>`
}

function contactText(f: BookingFacts, opts: { icsAttached: boolean }): (string | false | null | undefined)[] {
  return [
    f.whatsappUrl && `Contacter le club sur WhatsApp : ${f.whatsappUrl}`,
    f.calendar && `Ajouter à Google Agenda : ${googleCalendarUrl(f.calendar)}`,
    f.calendar && opts.icsAttached && 'Apple Calendar / Outlook : ouvrez le fichier joint booking.ics.',
  ]
}

function factsTable(f: BookingFacts, extra: [string, string][] = []): string {
  const rows: [string, string][] = [
    ['Club', f.clubName],
    ['Terrain', `${f.courtName} (${sportLabel(f.sport)})`],
    ['Date', f.date],
    ['Heure', f.time],
    ['Référence', f.reference],
    ...extra,
  ]
  const tr = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:${ASH};white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`
    )
    .join('')
  return `<table role="presentation" style="border-collapse:collapse;margin:16px 0;font-size:15px">${tr}</table>`
}

function shell(title: string, intro: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:${OAT};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${INK}">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:${FOREST};color:${BONE};border-radius:12px 12px 0 0;padding:20px 24px;font-size:20px;font-weight:700">ShiftGrid</div>
<div style="background:${BONE};border-radius:0 0 12px 12px;padding:28px 24px">
<h1 style="margin:0 0 12px;font-size:22px;color:${INK}">${esc(title)}</h1>
<p style="margin:0 0 8px;line-height:1.6;color:${INK}">${intro}</p>
${body}
<p style="margin:32px 0 0;font-size:12px;color:${ASH}">Vous recevez ce message à la suite d'une réservation sur ShiftGrid. Merci de ne pas y répondre.</p>
</div></div></body></html>`
}

function textOf(lines: (string | false | null | undefined)[]): string {
  return lines.filter((l): l is string => typeof l === 'string').join('\n')
}

function factsText(f: BookingFacts): string[] {
  return [
    `Club : ${f.clubName}`,
    `Terrain : ${f.courtName} (${sportLabel(f.sport)})`,
    `Date : ${f.date}`,
    `Heure : ${f.time}`,
    `Référence : ${f.reference}`,
  ]
}

/* ------------------------------ confirmation ------------------------------ */

export type ConfirmationProps = BookingFacts & {
  recipientName: string
  state: PaymentState
  /** Charged just now (0 for cash). */
  paidNow: number
  /** The booking's pass page. A guest's link carries their secret. */
  passUrl: string
  /** Guests only: their secret link to cancel without an account. */
  cancelUrl: string | null
  /** Split only: how many other players were emailed their payment link. */
  invitesEmailed: number
  /** The 6-digit arrival code. The QR image itself is attached by the sender (CHECK_IN_QR_CID). */
  checkInCode?: string | null
}

const CHECK_IN_INSTRUCTION = 'Présentez ce code ou ce QR code à l\'accueil du club pour valider votre arrivée.'

function checkInBlock(code: string): string {
  return `<div style="margin:20px 0 0;padding:18px 16px;background:#ffffff;border:1px solid ${OAT};border-radius:10px;text-align:center">
<p style="margin:0 0 4px;font-size:13px;color:${ASH}">Votre code d'arrivée</p>
<p style="margin:0;font-size:34px;letter-spacing:8px;color:${INK}"><strong>${esc(code)}</strong></p>
<img src="cid:${CHECK_IN_QR_CID}" width="160" height="160" alt="QR code d'arrivée ${esc(code)}" style="display:block;margin:14px auto 0;border:0">
<p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:${INK}">${esc(CHECK_IN_INSTRUCTION)}</p>
</div>`
}

export function confirmationEmail(p: ConfirmationProps): Rendered {
  const headline =
    p.state === 'confirmed' ? 'Votre réservation est confirmée' : p.state === 'awaiting_shares' ? 'Votre créneau est retenu' : 'Votre créneau est réservé'
  const subject = `${p.state === 'confirmed' ? 'Réservation confirmée' : 'Réservation enregistrée'} : ${p.courtName}, ${p.date} ${p.time.split(' ')[0]}`

  const payment =
    p.state === 'confirmed'
      ? `Payé en totalité (${formatTND(p.amount)}).`
      : p.state === 'awaiting_shares'
        ? `Vous avez payé votre part (${formatTND(p.paidNow)}). La réservation est confirmée dès que chaque joueur a payé le reste, soit ${formatTND(p.amount - p.paidNow)}.${p.invitesEmailed ? ` Nous avons envoyé son lien de paiement à ${p.invitesEmailed} ${p.invitesEmailed === 1 ? 'joueur' : 'joueurs'}.` : ''}`
        : `Merci de payer ${formatTND(p.amount)} en espèces au club. Le personnel confirmera votre paiement à votre arrivée.`

  const cancel = p.cancelUrl
    ? `<p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:${ASH}">Besoin d'annuler ? Gratuit jusqu'à 24 heures avant votre créneau, avec ce lien privé (gardez-le pour vous) : <a href="${esc(safeUrl(p.cancelUrl))}" style="color:${TEAL}">annuler cette réservation</a>.</p>`
    : ''

  const html = shell(
    headline,
    `Bonjour ${esc(p.recipientName)}, voici le détail de votre réservation.`,
    `${factsTable(p, [['Total', formatTND(p.amount)], ['Joueurs', String(p.playerCount)]])}
<p style="margin:0;line-height:1.6">${esc(payment)}</p>
${p.checkInCode ? checkInBlock(p.checkInCode) : ''}
${button('Voir votre pass de réservation', p.passUrl)}${contactBlock(p, { icsAttached: true })}${cancel}`
  )

  const text = textOf([
    `${headline}`,
    `Bonjour ${p.recipientName}, voici le détail de votre réservation.`,
    '',
    ...factsText(p),
    `Total : ${formatTND(p.amount)}`,
    '',
    payment,
    '',
    p.checkInCode && `Code d\'arrivée : ${p.checkInCode}`,
    p.checkInCode && CHECK_IN_INSTRUCTION,
    p.checkInCode && '',
    `Votre pass : ${p.passUrl}`,
    ...contactText(p, { icsAttached: true }),
    p.cancelUrl && `Annuler (lien privé) : ${p.cancelUrl}`,
  ])
  return { subject, html, text }
}

/* -------------------------------- split invite ----------------------------- */

export type SplitInviteProps = BookingFacts & {
  organizerName: string
  /** This player's share. */
  share: number
  joinUrl: string
}

export function splitInviteEmail(p: SplitInviteProps): Rendered {
  const subject = `${p.organizerName} vous invite à jouer à ${p.clubName} le ${p.date}`
  const html = shell(
    'Vous êtes invité à jouer',
    `<strong>${esc(p.organizerName)}</strong> a réservé un terrain et partage le coût. Votre part est de <strong>${esc(formatTND(p.share))}</strong>.`,
    `${factsTable(p, [['Votre part', formatTND(p.share)]])}
<p style="margin:0;line-height:1.6">La réservation est confirmée dès que chaque joueur a payé sa part. Ce lien est personnel et ne fonctionne qu'une fois.</p>
${button(`Payer ${formatTND(p.share)}`, p.joinUrl)}`
  )
  const text = textOf([
    `${p.organizerName} vous invite à jouer.`,
    '',
    ...factsText(p),
    `Votre part : ${formatTND(p.share)}`,
    '',
    `Payer votre part (lien privé à usage unique) : ${p.joinUrl}`,
  ])
  return { subject, html, text }
}

/* -------------------------------- cancellation ---------------------------- */

export type CancellationProps = BookingFacts & {
  recipientName: string
  reason: string | null
  /** Money recorded as refunded (0 if nothing had been paid). */
  refundAmount: number
  /** Who cancelled: the booker themselves, or the club. */
  cancelledBy: 'you' | 'club'
}

export function cancellationEmail(p: CancellationProps): Rendered {
  const subject = `Réservation annulée : ${p.courtName}, ${p.date} ${p.time.split(' ')[0]}`
  const who = p.cancelledBy === 'club' ? `${p.clubName} a annulé cette réservation.` : 'Vous avez annulé cette réservation.'
  const refund =
    p.refundAmount > 0
      ? `Un remboursement de ${formatTND(p.refundAmount)} a été enregistré pour cette réservation. ${p.clubName} le restitue aux joueurs qui ont payé ; contactez le club si vous ne l'avez pas reçu sous quelques jours.`
      : 'Rien n\'avait été payé en ligne : il n\'y a donc rien à rembourser.'
  const html = shell(
    'Réservation annulée',
    `Bonjour ${esc(p.recipientName)}, ${esc(who)} Le créneau a été libéré.`,
    `${factsTable(p)}
${p.reason ? `<p style="margin:0 0 12px;line-height:1.6"><span style="color:${ASH}">Motif :</span> ${esc(p.reason)}</p>` : ''}
<p style="margin:0;line-height:1.6">${esc(refund)}</p>`
  )
  const text = textOf([
    'Réservation annulée',
    `Bonjour ${p.recipientName}, ${who} Le créneau a été libéré.`,
    '',
    ...factsText(p),
    p.reason && `Motif : ${p.reason}`,
    '',
    refund,
  ])
  return { subject, html, text }
}

/* ---------------------------------- reminder ------------------------------- */

export type ReminderProps = BookingFacts & {
  recipientName: string
  state: PaymentState
  /** Cash still to pay at the club (0 when settled). */
  dueAtClub: number
  /** Split only: shares still unpaid. */
  unpaidShares: number
  /** Members: their pass page. Guests have no stored link, so null. */
  passUrl: string | null
}

export function reminderEmail(p: ReminderProps): Rendered {
  const start = p.time.split(' ')[0]
  const subject = `Rappel : vous jouez à ${p.clubName} à ${start}`
  const note =
    p.state === 'pay_at_club'
      ? `N'oubliez pas de payer ${formatTND(p.dueAtClub)} en espèces au club.`
      : p.state === 'awaiting_shares' && p.unpaidShares > 0
        ? `${p.unpaidShares} ${p.unpaidShares === 1 ? 'part reste impayée' : 'parts restent impayées'}. La réservation n'est confirmée qu'une fois que tout le monde a payé.`
        : 'Tout est payé. Il ne vous reste qu\'à venir.'
  const html = shell(
    `Vous jouez aujourd'hui à ${start}`,
    `Bonjour ${esc(p.recipientName)}, petit rappel : votre match commence dans environ deux heures.`,
    `${factsTable(p)}
<p style="margin:0;line-height:1.6">${esc(note)}</p>
${p.passUrl ? button('Voir votre pass de réservation', p.passUrl) : `<p style="margin:16px 0 0;font-size:14px;color:${ASH}">Indiquez la référence ${esc(p.reference)} au club.</p>`}${contactBlock(p, { icsAttached: false })}`
  )
  const text = textOf([
    `Rappel : vous jouez aujourd'hui à ${start}`,
    `Bonjour ${p.recipientName}, votre match commence dans environ deux heures.`,
    '',
    ...factsText(p),
    '',
    note,
    p.passUrl ? `Votre pass : ${p.passUrl}` : `Indiquez la référence ${p.reference} au club.`,
    ...contactText(p, { icsAttached: false }),
  ])
  return { subject, html, text }
}
