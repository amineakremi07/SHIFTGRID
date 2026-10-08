import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { reportServerError } from '@/lib/observability'
import { recordMetric } from '@/lib/utils/performance'

/**
 * POST /api/analytics/web-vitals
 * Receives Web Vitals from the browser (sendBeacon / fetch). There is deliberately no GET: the
 * aggregates were readable by anyone and lived in per-instance memory. Read vitals in Sentry/PostHog.
 */
const webVitalSchema = z
  .object({
    name: z.enum(['CLS', 'FID', 'LCP', 'FCP', 'TTFB', 'INP']),
    value: z.number().finite().min(0).max(120_000),
    url: z.string().max(200).optional(),
    timestamp: z.number().finite().optional(),
  })
  .strip()

export async function POST(request: NextRequest) {
  try {
    const parsed = webVitalSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }
    const { name, value, url, timestamp } = parsed.data

    recordMetric(`web-vital:${name.toLowerCase()}`, value, 'ms', {
      type: 'web-vital',
      // Path only: query strings can carry secret tokens.
      url: (url ?? 'unknown').split(/[?#]/)[0],
      userAgent: request.headers.get('user-agent')?.slice(0, 200) ?? 'unknown',
      clientTimestamp: timestamp?.toString() ?? 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    // Malformed JSON is the caller's fault, not a server error.
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 })
    }
    console.error('Web Vitals error:', error instanceof Error ? error.message : error)
    reportServerError('api.web-vitals.post', error)
    return NextResponse.json({ success: false, error: 'Failed to record metric' }, { status: 500 })
  }
}
