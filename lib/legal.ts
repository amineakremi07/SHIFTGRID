/**
 * Single place for the legal text's moving parts. Bump LEGAL_VERSION whenever
 * /terms or /privacy change materially: it is stored with each account's consent
 * (auth user metadata), so we can tell which wording a person agreed to.
 */
export const LEGAL_VERSION = '2026-10-04.1'

/** Data-protection contact printed on /privacy. Override per environment. */
export const LEGAL_CONTACT_EMAIL = process.env.NEXT_PUBLIC_LEGAL_EMAIL || 'privacy@shiftgrid.tn'

/** The legal entity operating ShiftGrid, printed on /terms and /privacy. Set before launch. */
export const LEGAL_ENTITY = process.env.NEXT_PUBLIC_LEGAL_ENTITY || 'ShiftGrid'

/** Where the entity is registered (address / RNE number), printed when set. */
export const LEGAL_ENTITY_DETAILS = process.env.NEXT_PUBLIC_LEGAL_ENTITY_DETAILS || ''

/** What we store next to an account that ticked the consent box. */
export function consentMetadata(now = new Date()) {
  return { terms_accepted_at: now.toISOString(), terms_version: LEGAL_VERSION }
}
