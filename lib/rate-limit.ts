import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

import { captureRateLimit, pathOf } from '@/lib/telemetry'

/**
 * Rate limiting for sensitive routes and Server Actions.
 *
 * Backing store
 *  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` set: a shared sliding
 *    window in Upstash Redis, correct across serverless instances.
 *  - Not set (local dev, tests, dry runs): an in-memory sliding window with the same
 *    limits. It is per process, so it is NOT adequate behind several instances; a
 *    warning is logged once in production.
 *  - Upstash unreachable at request time: that request falls back to the in-memory
 *    window rather than failing the user or silently allowing everything.
 *  - `RATE_LIMIT_DISABLED=1`: no limiting (automated browser tests only; ignored in production).
 */

export type RateRule = 'auth' | 'booking' | 'cron' | 'lookup' | 'api'

/** requests per window (seconds), per key. */
export const RATE_RULES: Record<RateRule, { max: number; windowSec: number; label: string }> = {
  /** Sign-in, sign-up, invite acceptance: brute force and account spam. Per IP. */
  auth: { max: 5, windowSec: 60, label: 'sign-in attempts' },
  /** Creating bookings / paying shares: slot hogging. Per user, else per IP. */
  booking: { max: 10, windowSec: 60, label: 'booking requests' },
  /** The scheduler endpoint, checked before its secret so the secret cannot be guessed at speed. */
  cron: { max: 10, windowSec: 60, label: 'cron calls' },
  /** Unauthenticated lookups that reach third parties or the database (geocoding, registry check). */
  lookup: { max: 20, windowSec: 60, label: 'lookups' },
  /** Everything else under /api. */
  api: { max: 60, windowSec: 60, label: 'API requests' },
}

export type RateResult = {
  ok: boolean
  limit: number
  remaining: number
  /** Seconds until a blocked caller may retry (0 when allowed). */
  retryAfter: number
}

/* ------------------------------ in-memory window ------------------------------ */

const memory = new Map<string, number[]>()
let lastSweep = 0

function memoryLimit(rule: RateRule, key: string, now = Date.now()): RateResult {
  const { max, windowSec } = RATE_RULES[rule]
  const windowMs = windowSec * 1000
  const id = `${rule}:${key}`

  if (now - lastSweep > windowMs) {
    lastSweep = now
    for (const [k, stamps] of memory) {
      if (!stamps.length || now - stamps[stamps.length - 1] > windowMs) memory.delete(k)
    }
  }

  const stamps = (memory.get(id) ?? []).filter((t) => now - t < windowMs)
  if (stamps.length >= max) {
    memory.set(id, stamps)
    return { ok: false, limit: max, remaining: 0, retryAfter: Math.max(1, Math.ceil((stamps[0] + windowMs - now) / 1000)) }
  }
  stamps.push(now)
  memory.set(id, stamps)
  return { ok: true, limit: max, remaining: max - stamps.length, retryAfter: 0 }
}

/* --------------------------------- Upstash ------------------------------------ */

const limiters = new Map<RateRule, Ratelimit>()
let redis: Redis | null | undefined
let warned = false

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

/** Which backend is active, for logs and the test script. */
export function rateLimitBackend(): 'upstash' | 'memory' | 'disabled' {
  if (disabled()) return 'disabled'
  return upstashConfigured() ? 'upstash' : 'memory'
}

function disabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === '1' && process.env.NODE_ENV !== 'production'
}

function upstashLimiter(rule: RateRule): Ratelimit | null {
  if (!upstashConfigured()) {
    if (!warned && process.env.NODE_ENV === 'production') {
      warned = true
      console.warn('rate-limit: UPSTASH_REDIS_REST_URL/TOKEN not set; using a per-instance in-memory limiter')
    }
    return null
  }
  redis ??= Redis.fromEnv()
  let limiter = limiters.get(rule)
  if (!limiter) {
    const { max, windowSec } = RATE_RULES[rule]
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `shiftgrid:rl:${rule}`,
      analytics: false,
    })
    limiters.set(rule, limiter)
  }
  return limiter
}

/**
 * Count one request against `rule` for `key` (an IP, or `user:<id>`). A blocked request is reported to
 * PostHog as `rate_limit_exceeded` (route, limit, remaining, backend; never the key, which holds an IP or user id).
 * `route` is the path being protected; without it the rule name stands in.
 */
export async function rateLimit(rule: RateRule, key: string, route?: string): Promise<RateResult> {
  const { result, source } = await countRequest(rule, key)
  if (!result.ok) {
    captureRateLimit({ route: route ?? `rule:${rule}`, rule, limit: result.limit, remaining: result.remaining, source })
  }
  return result
}

async function countRequest(rule: RateRule, key: string): Promise<{ result: RateResult; source: 'upstash_redis' | 'memory' }> {
  const { max } = RATE_RULES[rule]
  if (disabled()) return { result: { ok: true, limit: max, remaining: max, retryAfter: 0 }, source: 'memory' }

  const limiter = upstashLimiter(rule)
  if (limiter) {
    try {
      const r = await limiter.limit(key)
      return {
        result: {
          ok: r.success,
          limit: r.limit,
          remaining: r.remaining,
          retryAfter: r.success ? 0 : Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)),
        },
        source: 'upstash_redis',
      }
    } catch (error) {
      console.error('rate-limit: upstash failed, using memory', error instanceof Error ? error.message : String(error))
    }
  }
  return { result: memoryLimit(rule, key), source: 'memory' }
}

/* --------------------------------- helpers ------------------------------------ */

/** Client IP from forwarding headers (`NextRequest.ip` no longer exists in Next 16). */
export function clientIpFrom(h: Pick<Headers, 'get'>): string {
  const forwarded = h.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim() || 'unknown'
  return h.get('x-real-ip')?.trim() || 'unknown'
}

/** Standard 429 with Retry-After and the usual RateLimit-* hints. */
export function tooManyRequests(result: RateResult, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.', retryAfter: result.retryAfter },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        ...extraHeaders,
      },
    }
  )
}

export function retryMessage(rule: RateRule, result: RateResult): string {
  const s = result.retryAfter
  return `Too many ${RATE_RULES[rule].label}. Please wait ${s} second${s === 1 ? '' : 's'} and try again.`
}

/**
 * For Server Actions: count a call against `rule`, keyed by the signed-in user when
 * the caller knows one (`userId`), else by IP. Returns null when allowed, or a
 * ready-to-show message when the caller is over the limit.
 */
export async function actionRateLimit(rule: RateRule, userId?: string | null): Promise<string | null> {
  const h = await headers()
  const key = userId ? `user:${userId}` : `ip:${clientIpFrom(h)}`
  // The page the action was called from (path only) tells which feature was throttled.
  const result = await rateLimit(rule, key, pathOf(h.get('referer')))
  return result.ok ? null : retryMessage(rule, result)
}
