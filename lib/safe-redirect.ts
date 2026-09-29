/**
 * Validate a post-login / post-signup redirect target taken from the URL
 * (`?next=`). Only same-site absolute paths are allowed, which prevents an open
 * redirect such as `?next=https://evil.example` or `?next=//evil.example`.
 *
 * Returns the path unchanged when it is safe, otherwise `null`.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value) return null
  // Must be a single-slash absolute path.
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // No backslashes (browsers treat "/\host" like "//host"), no control characters.
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null
  // Some parsers accept "/:" style scheme tricks; a plain path never needs a colon
  // before its first "?" or "#".
  const beforeQuery = value.split(/[?#]/, 1)[0]
  if (beforeQuery.includes(':')) return null
  return value
}
