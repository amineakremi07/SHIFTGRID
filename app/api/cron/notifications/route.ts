import { createHash, timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { emailEnabled } from '@/lib/notifications/mailer'
import { appOrigin } from '@/lib/notifications/origin'
import { retryFailedNotifications, sendDueReminders } from '@/lib/notifications/service'

/**
 * Scheduled notification run: sends the two-hour booking reminders that are due and
 * retries emails that failed. Call it every 5 to 15 minutes from any scheduler
 * (Vercel Cron, Supabase pg_cron + pg_net, GitHub Actions, a plain crontab):
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-site/api/cron/notifications
 *
 * Vercel Cron sends that header itself when the CRON_SECRET environment variable is
 * set. The run is idempotent (each reminder has a unique dedupe key), so a double
 * trigger or an overlapping run never sends twice.
 */
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const digest = (value: string) => createHash('sha256').update(value).digest()

function authorized(request: Request, secret: string): boolean {
  const presented = request.headers.get('authorization') ?? ''
  // Compare fixed-length digests so neither the length nor the content leaks through timing.
  return timingSafeEqual(digest(presented), digest(`Bearer ${secret}`))
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET
  // No secret configured means the endpoint is off, never "open".
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured (16+ characters required).' }, { status: 503 })
  }
  if (!authorized(request, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const origin = await appOrigin()
  const reminders = await sendDueReminders(now, origin)
  const retried = await retryFailedNotifications(now)
  return NextResponse.json({ ok: true, at: now.toISOString(), emailEnabled: emailEnabled(), reminders, retried })
}

export const GET = run
export const POST = run
