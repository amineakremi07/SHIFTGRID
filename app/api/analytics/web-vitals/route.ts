import { NextRequest, NextResponse } from 'next/server'
import { recordMetric, getAggregatedMetrics } from '@/lib/utils/performance'

/**
 * POST /api/analytics/web-vitals
 * Receive Web Vitals metrics from client-side
 * Callers: Client-side reportWebVitals function, browser sendBeacon/fetch
 * Affected API: POST /api/analytics/web-vitals, GET /api/analytics/web-vitals
 * Data schemas: WebVitals metric {name, value, url, timestamp, userAgent}
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const { name, value, url, timestamp, userAgent } = body

    // Validate required fields
    if (!name || typeof value !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid payload: name and value are required' },
        { status: 400 }
      )
    }

    // Record the metric
    recordMetric(`web-vital:${name}`, value, 'ms', {
      type: 'web-vital',
      url: url || 'unknown',
      userAgent: userAgent || 'unknown',
      clientTimestamp: timestamp?.toString() || 'unknown',
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Web Vitals error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record metric' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/analytics/web-vitals
 * Get aggregated Web Vitals metrics (admin only)
 * Callers: Admin analytics dashboard
 * Affected API: GET /api/analytics/web-vitals
 * Data schemas: Aggregated metrics {count, avg, min, max, p50, p95, p99}
 */
export async function GET(request: NextRequest) {
  try {
    // In production, add auth check here
    // const session = await getServerSession()
    // if (!session || session.user.role !== 'platform_admin') {
    //   return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    // }

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
      ? parseInt(searchParams.get('since')!)
      : Date.now() - 24 * 60 * 60 * 1000 // Last 24 hours

    const vitals = ['cls', 'fid', 'lcp', 'fcp', 'ttfb', 'inp']
    const results: Record<string, any> = {}

    for (const vital of vitals) {
      const aggregated = getAggregatedMetrics(`web-vital:${vital}`, since)
      if (aggregated) {
        results[vital] = aggregated
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      period: { since, until: Date.now() },
    })
  } catch (error) {
    console.error('Get Web Vitals error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}