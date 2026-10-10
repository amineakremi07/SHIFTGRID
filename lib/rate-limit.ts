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

export type RateRule = 'auth' | 'booking' | 'guest_ip' | 'cron' | 'lookup' | 'api'

/** requests per window (seconds), per key. */
export const RATE_RULES: Record<RateRule, { max: number; windowSec: number; label: string }> = {
  /** Sign-in, sign-up, invite acceptance: brute force and account spam. Per IP. */
  auth: { max: 5, windowSec: 60, label: 'tentatives de connexion' },
  /** Creating bookings / paying shares: slot hogging. Per user, else per IP. */
  booking: { max: 10, windowSec: 60, label: 'demandes de réservation' },
  /**
   * Guest bookings, per IP only: the backstop for the per-(phone + IP) `booking` bucket, which a caller can
   * dodge by changing phone numbers. Looser than `booking` so a shared mobile-carrier address (CGNAT) is not locked out.
   */
  guest_ip: { max: 30, windowSec: 60, label: 'demandes de réservation depuis ce réseau' },
  /** The scheduler endpoint, checked before its secret so the secret cannot be guessed at speed. */
  cron: { max: 10, windowSec: 60, label: 'appels cron' },
  /** Unauthenticated lookups that reach third parties or the database (geocoding, registry check). */
  lookup: { max: 20, windowSec: 60, label: 'recherches' },
  /** Everything else under /api. */
  api: { max: 60, windowSec: 60, label: 'requêtes API' },
}

/** A max / window pair; an explicit one overrides the rule's default (per-API-key limits). */
export type Limits = { max: number; windowSec: number }

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

function memoryLimit(rule: RateRule, key: string, limits: Limits, now = Date.now()): RateResult {
  const { max, windowSec } = limits
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

const limiters = new Map<string, Ratelimit>()
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

function upstashLimiter(rule: RateRule, limits: Limits): Ratelimit | null {
  if (!upstashConfigured()) {
    if (!warned && process.env.NODE_ENV === 'production') {
      warned = true
      console.warn('rate-limit: UPSTASH_REDIS_REST_URL/TOKEN not set; using a per-instance in-memory limiter')
    }
    return null
  }
  redis ??= Redis.fromEnv()
  const id = `${rule}:${limits.max}:${limits.windowSec}`
  let limiter = limiters.get(id)
  if (!limiter) {
    const { max, windowSec } = limits
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      prefix: `shiftgrid:rl:${rule}:${max}:${windowSec}`,
      analytics: false,
    })
    limiters.set(id, limiter)
  }
  return limiter
}

/**
 * Count one request against `rule` for `key` (an IP, or `user:<id>`). A blocked request is reported to
 * PostHog as `rate_limit_exceeded` (route, limit, remaining, backend; never the key, which holds an IP or user id).
 * `route` is the path being protected; without it the rule name stands in.
 * `limits` replaces the rule's default max / window (an API key's own stored limit).
 */
export async function rateLimit(rule: RateRule, key: string, route?: string, limits?: Limits): Promise<RateResult> {
  const { result, source } = await countRequest(rule, key, limits ?? RATE_RULES[rule])
  if (!result.ok) {
    captureRateLimit({ route: route ?? `rule:${rule}`, rule, limit: result.limit, remaining: result.remaining, source })
  }
  return result
}

async function countRequest(rule: RateRule, key: string, limits: Limits): Promise<{ result: RateResult; source: 'upstash_redis' | 'memory' }> {
  const { max } = limits
  if (disabled()) return { result: { ok: true, limit: max, remaining: max, retryAfter: 0 }, source: 'memory' }

  const limiter = upstashLimiter(rule, limits)
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
  return { result: memoryLimit(rule, key, limits), source: 'memory' }
}

/* --------------------------------- helpers ------------------------------------ */

/**
 * Client IP, taking only headers a trusted proxy sets.
 *  - On Vercel (`VERCEL` is set) the platform overwrites `x-vercel-forwarded-for` / `x-real-ip` /
 *    `x-forwarded-for`, so a client cannot choose them; the first non-empty one wins.
 *  - Anywhere else a client can send any of those headers. `x-real-ip` is what a typical reverse proxy
 *    sets; otherwise take the LAST `x-forwarded-for` hop (the one our nearest proxy appended), never the
 *    first, which is the part a client controls. No usable header gives 'unknown'.
 * (`NextRequest.ip` no longer exists in Next 16.)
 */
export function clientIpFrom(h: Pick<Headers, 'get'>): string {
  const first = (v: string | null) => v?.split(',')[0]?.trim() || ''
  if (process.env.VERCEL) {
    return first(h.get('x-vercel-forwarded-for')) || h.get('x-real-ip')?.trim() || first(h.get('x-forwarded-for')) || 'unknown'
  }
  const real = h.get('x-real-ip')?.trim()
  if (real) return real
  const hops = (h.get('x-forwarded-for') ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  return hops[hops.length - 1] || 'unknown'
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
  return `Trop de ${RATE_RULES[rule].label}. Veuillez patienter ${s} seconde${s === 1 ? '' : 's'} puis réessayer.`
}

/**
 * For Server Actions: count a call against `rule`, keyed by the signed-in user when
 * the caller knows one (`userId`), else by IP. Returns null when allowed, or a
 * ready-to-show message when the caller is over the limit. `discriminator` narrows an IP bucket (for example
 * to one phone number); pass a hash, never raw personal data, since it becomes part of the stored key.
 */
export async function actionRateLimit(rule: RateRule, userId?: string | null, discriminator?: string): Promise<string | null> {
  const h = await headers()
  const key = userId ? `user:${userId}` : `ip:${clientIpFrom(h)}${discriminator ? `:${discriminator}` : ''}`
  // The page the action was called from (path only) tells which feature was throttled.
  const result = await rateLimit(rule, key, pathOf(h.get('referer')))
  return result.ok ? null : retryMessage(rule, result)
}
