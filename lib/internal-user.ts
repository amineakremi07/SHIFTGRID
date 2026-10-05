/**
 * Internal-traffic marker for PostHog, so team activity can be filtered out of the dashboards
 * (PostHog > Settings > Project > Internal & test users: `is_internal_user` = true).
 *
 * Automatic on localhost and in development; on production a team member opts a browser in by running
 * `shiftgridInternal.enable()` in the DevTools console. The opt-in is remembered in this browser only
 * (localStorage `sg-internal`) and, like every PostHog event, is applied only after the visitor consented
 * to analytics: this module never loads or contacts PostHog by itself.
 */

export const INTERNAL_FLAG = { is_internal_user: true } as const
export const INTERNAL_STORAGE_KEY = 'sg-internal'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Automatic rule: a local machine, or a build that declares itself `development`. */
export function isInternalEnvironment(input: { hostname: string; appEnv?: string; nodeEnv?: string }): boolean {
  const host = input.hostname.toLowerCase()
  return (
    LOCAL_HOSTS.has(host) ||
    host.endsWith('.localhost') ||
    input.appEnv === 'development' ||
    // A deployed production build never counts as "development" through NODE_ENV alone.
    (input.nodeEnv === 'development' && input.appEnv === undefined)
  )
}

export function hasInternalOptIn(storage: Pick<Storage, 'getItem'> | null): boolean {
  try {
    return storage?.getItem(INTERNAL_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/** Whether this browser's events should carry `is_internal_user: true`. */
export function shouldRegisterInternal(input: {
  hostname: string
  appEnv?: string
  nodeEnv?: string
  storage: Pick<Storage, 'getItem'> | null
}): boolean {
  return isInternalEnvironment(input) || hasInternalOptIn(input.storage)
}
