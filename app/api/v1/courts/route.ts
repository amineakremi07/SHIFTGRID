import { NextRequest, NextResponse } from 'next/server'
import { withApiKeyAuth } from '@/lib/middleware/api-auth'
import { reportServerError } from '@/lib/observability'
import { createClient } from '@supabase/supabase-js'

// Columns of public.courts (CHECK: sport in padel|tennis|football, status in active|maintenance)
const SPORTS = ['padel', 'tennis', 'football'] as const
const STATUSES = ['active', 'maintenance'] as const
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

// Create service client for database operations
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, error }, { status })

function intParam(value: string | null, fallback: number, min: number, max: number) {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback
}

/**
 * GET /api/v1/courts
 * List courts for the authenticated organization
 * Requires API key with 'read' permission
 * Filters: sport (or legacy sport_type), status (or legacy is_active=true|false), page, limit
 */
export const GET = withApiKeyAuth(async (request: NextRequest, context) => {
  try {
    const organizationId = context.organizationId
    if (!organizationId) return fail('API key is not linked to an organization', 400)

    const { searchParams } = new URL(request.url)
    const page = intParam(searchParams.get('page'), 1, 1, 10_000)
    const limit = intParam(searchParams.get('limit'), 20, 1, 100)

    const sport = searchParams.get('sport') ?? searchParams.get('sport_type')
    if (sport && !(SPORTS as readonly string[]).includes(sport)) {
      return fail(`Invalid sport. Allowed: ${SPORTS.join(', ')}`, 400)
    }

    let status = searchParams.get('status')
    const isActive = searchParams.get('is_active')
    if (!status && isActive !== null) {
      if (isActive !== 'true' && isActive !== 'false') return fail('is_active must be true or false', 400)
      status = isActive === 'true' ? 'active' : 'maintenance'
    }
    if (status && !(STATUSES as readonly string[]).includes(status)) {
      return fail(`Invalid status. Allowed: ${STATUSES.join(', ')}`, 400)
    }

    let query = getSupabaseAdmin()
      .from('courts')
      .select('*', { count: 'exact' })
      .eq('org_id', organizationId)
      .order('created_at', { ascending: false })

    if (sport) query = query.eq('sport', sport)
    if (status) query = query.eq('status', status)

    const from = (page - 1) * limit
    query = query.range(from, from + limit - 1)

    const { data: courts, error, count } = await query

    if (error) {
      reportServerError('api.v1.courts.list', error, { code: error.code })
      return fail('Failed to load courts', 500)
    }

    return NextResponse.json({
      success: true,
      data: courts ?? [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('List courts error:', error instanceof Error ? error.message : error)
    reportServerError('api.v1.courts.list', error)
    return fail('An unexpected error occurred', 500)
  }
})

/**
 * POST /api/v1/courts
 * Create a new court
 * Requires API key with 'write' permission
 * Body: { name, sport (or sport_type), price_per_hour, status?, open_time?, close_time?,
 *         night_surcharge_per_hour?, night_starts_at? }
 */
export const POST = withApiKeyAuth(async (request: NextRequest, context) => {
  try {
    const organizationId = context.organizationId
    if (!organizationId) return fail('API key is not linked to an organization', 400)

    // Check for write permission
    if (!context.permissions.includes('write') && !context.permissions.includes('admin')) {
      return fail('Write permission required', 403)
    }

    let body: Record<string, unknown>
    try {
      const parsed = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      body = parsed as Record<string, unknown>
    } catch {
      return fail('Request body must be a JSON object', 400)
    }

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const sport = body.sport ?? body.sport_type
    const price = body.price_per_hour

    if (!name || sport == null || price == null) {
      return fail('Missing required fields: name, sport, price_per_hour', 400)
    }
    if (typeof sport !== 'string' || !(SPORTS as readonly string[]).includes(sport)) {
      return fail(`Invalid sport. Allowed: ${SPORTS.join(', ')}`, 400)
    }
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return fail('price_per_hour must be a non-negative number', 400)
    }

    let status: string = 'active'
    if (body.status !== undefined) status = String(body.status)
    else if (body.is_active === false) status = 'maintenance'
    if (!(STATUSES as readonly string[]).includes(status)) {
      return fail(`Invalid status. Allowed: ${STATUSES.join(', ')}`, 400)
    }

    const row: Record<string, unknown> = { org_id: organizationId, name, sport, price_per_hour: price, status }

    for (const key of ['open_time', 'close_time', 'night_starts_at'] as const) {
      if (body[key] === undefined || body[key] === null) continue
      if (typeof body[key] !== 'string' || !TIME.test(body[key])) return fail(`${key} must be HH:MM`, 400)
      row[key] = body[key]
    }
    if (body.night_surcharge_per_hour !== undefined && body.night_surcharge_per_hour !== null) {
      const s = body.night_surcharge_per_hour
      if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) {
        return fail('night_surcharge_per_hour must be a non-negative number', 400)
      }
      row.night_surcharge_per_hour = s
    }

    const { data: court, error } = await getSupabaseAdmin()
      .from('courts')
      .insert(row as never)
      .select()
      .single()

    if (error) {
      reportServerError('api.v1.courts.create', error, { code: error.code })
      return fail('Failed to create court', 500)
    }

    return NextResponse.json({ success: true, data: court }, { status: 201 })
  } catch (error) {
    console.error('Create court error:', error instanceof Error ? error.message : error)
    reportServerError('api.v1.courts.create', error)
    return fail('An unexpected error occurred', 500)
  }
})
