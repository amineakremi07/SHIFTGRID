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
