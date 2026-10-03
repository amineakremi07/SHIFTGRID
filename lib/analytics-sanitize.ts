/**
 * Keeps secrets out of analytics. Guest pass, guest-cancel, staff-invite and share-payment
 * links carry a secret in the query string (?token=...), and PostHog attaches the page URL
 * and the referrer to every event on its own. So every URL-like property loses its query
 * string and fragment before leaving the browser. We never need them: pages are identified
 * by path.
 */
const URL_KEYS = new Set([
  '$current_url',
  '$referrer',
  '$initial_current_url',
  '$initial_referrer',
  '$session_entry_url',
  '$session_entry_referrer',
  '$prev_pageview_pathname',
  '$pathname',
])

/** "https://x.tn/a?token=abc#h" -> "https://x.tn/a"; non-URLs are returned unchanged. */
export function stripQueryAndHash(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

type EventLike = { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> }

/** rrweb "Meta" events (type 4) carry the page URL in `data.href`. */
const RRWEB_META = 4

/**
 * Session recordings travel as `$snapshot` events whose `$snapshot_data` is a list of rrweb
 * events; the Meta ones record the page address, so they get the same treatment.
 */
function sanitizeSnapshots(data: unknown) {
  if (!Array.isArray(data)) return
  for (const item of data) {
    const d = (item as { type?: unknown; data?: { href?: unknown } } | null)?.data
    if ((item as { type?: unknown })?.type === RRWEB_META && d && typeof d.href === 'string') {
      d.href = stripQueryAndHash(d.href)
    }
  }
}

/** PostHog `before_send`: returns the same event with URL properties cleaned. */
export function sanitizeEvent<T extends EventLike | null>(event: T): T {
  if (!event) return event
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (!bag) continue
    for (const key of Object.keys(bag)) {
      const v = bag[key]
      if (URL_KEYS.has(key) && typeof v === 'string') bag[key] = stripQueryAndHash(v)
    }
  }
  if (event.properties) sanitizeSnapshots(event.properties.$snapshot_data)
  return event
}
