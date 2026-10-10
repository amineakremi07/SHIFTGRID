/**
 * WhatsApp contact links. Pure (no server imports): used by the confirmation screen, the pass page,
 * the settings form and the email templates.
 *
 * Numbers are stored as digits in international form without "+" (Tunisia: 216XXXXXXXX), the format
 * `https://wa.me/<number>` expects.
 */

const TUNISIAN_LOCAL = /^[2-579]\d{7}$/

/** "98 123 456", "+216 98 123 456", "00216 98123456" -> "21698123456". Null when it is not a usable number. */
export function normalizeWhatsapp(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[\s().-]/g, '')
  if (digits.startsWith('+')) digits = digits.slice(1)
  else if (digits.startsWith('00')) digits = digits.slice(2)
  if (!/^\d+$/.test(digits)) return null
  if (TUNISIAN_LOCAL.test(digits)) digits = `216${digits}`
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null
}

/** The platform's own support number, used when a club has none (NEXT_PUBLIC_SUPPORT_WHATSAPP). */
export function supportWhatsapp(): string | null {
  return normalizeWhatsapp(process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP)
}

/** The club's number, else the platform support number, else null (callers then hide the button). */
export function resolveContactNumber(clubNumber: string | null | undefined): { number: string; isFallback: boolean } | null {
  const own = normalizeWhatsapp(clubNumber)
  if (own) return { number: own, isFallback: false }
  const support = supportWhatsapp()
  return support ? { number: support, isFallback: true } : null
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}

/** Pre-filled message: slot date, time and club name (plus court and reference to help the club find it). */
export function bookingWhatsappMessage(p: { clubName: string; date: string; time: string; courtName?: string; reference?: string }): string {
  return [
    `Bonjour ${p.clubName},`,
    `j'ai réservé${p.courtName ? ` ${p.courtName}` : ''} le ${p.date} de ${p.time}.`,
    p.reference ? `Référence : ${p.reference}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Ready-made link for a booking, or null when neither the club nor the platform has a number. */
export function bookingWhatsappLink(
  clubNumber: string | null | undefined,
  facts: { clubName: string; date: string; time: string; courtName?: string; reference?: string }
): string | null {
  const contact = resolveContactNumber(clubNumber)
  return contact ? whatsappUrl(contact.number, bookingWhatsappMessage(facts)) : null
}

/* ------------------------- reminders sent TO the player ------------------------- */

export type ReminderLocale = 'fr' | 'en' | 'ar'

export type ReminderFacts = {
  playerName: string
  clubName: string
  sport: 'padel' | 'tennis' | 'football'
  courtName: string
  /** Venue-time date and time range, already formatted (see lib/court-time.ts). */
  date: string
  time: string
  /** The club's WhatsApp / phone number, any format `normalizeWhatsapp` accepts. */
  clubContact?: string | null
  reference?: string
}

const SPORT_LABEL: Record<ReminderLocale, Record<ReminderFacts['sport'], string>> = {
  fr: { padel: 'padel', tennis: 'tennis', football: 'football' },
  en: { padel: 'padel', tennis: 'tennis', football: 'football' },
  ar: { padel: 'بادل', tennis: 'تنس', football: 'كرة القدم' },
}

/** The reminder text, to be sent about two hours before the slot. Plain text: no markup, no secret links. */
export function reminderWhatsappMessage(f: ReminderFacts, locale: ReminderLocale = 'fr'): string {
  const sport = SPORT_LABEL[locale][f.sport]
  const contact = normalizeWhatsapp(f.clubContact)
  const ref = f.reference
    ? { fr: `Référence : ${f.reference}.`, en: `Reference: ${f.reference}.`, ar: `المرجع: ${f.reference}.` }[locale]
    : null
  const reach = contact
    ? { fr: `Pour nous joindre : +${contact}.`, en: `To reach the club: +${contact}.`, ar: `للاتصال بالنادي: +${contact}.` }[locale]
    : null
  const body = {
    fr: `Bonjour ${f.playerName}, rappel : votre match de ${sport} à ${f.clubName} (${f.courtName}) a lieu le ${f.date}, de ${f.time}. À tout à l'heure !`,
    en: `Hello ${f.playerName}, a reminder: your ${sport} game at ${f.clubName} (${f.courtName}) is on ${f.date}, ${f.time}. See you soon!`,
    ar: `مرحبا ${f.playerName}، تذكير: مباراة ${sport} في ${f.clubName} (${f.courtName}) يوم ${f.date}، من ${f.time}. إلى اللقاء!`,
  }[locale]
  return [body, ref, reach].filter(Boolean).join(' ')
}

/** Reminders go out two hours before the start. */
export const REMINDER_LEAD_MINUTES = 120

/**
 * Link that opens WhatsApp on the PLAYER's number with the reminder pre-filled, so the club's front desk can
 * send it with one tap. It is click-to-chat, not an automated send (that needs the WhatsApp Business API).
 * Null when the player's phone is unusable.
 */
export function reminderWhatsappLink(playerPhone: string | null | undefined, facts: ReminderFacts, locale: ReminderLocale = 'fr'): string | null {
  const number = normalizeWhatsapp(playerPhone)
  return number ? whatsappUrl(number, reminderWhatsappMessage(facts, locale)) : null
}

/** True once the slot is within the reminder window and has not started. */
export function isReminderDue(startsAt: Date, now: Date = new Date()): boolean {
  const minutes = (startsAt.getTime() - now.getTime()) / 60_000
  return minutes > 0 && minutes <= REMINDER_LEAD_MINUTES
}
