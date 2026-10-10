import { NextRequest, NextResponse } from 'next/server'
import { apiCourtCreateSchema } from '@/lib/validations/court'
import { withApiKeyAuth } from '@/lib/middleware/api-auth'
import { reportServerError } from '@/lib/observability'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import type { CourtStatus, Database, Sport } from '@/lib/types/database'

type CourtInsert = Database['public']['Tables']['courts']['Insert']

// Columns of public.courts (CHECK: sport in padel|tennis|football, status in active|maintenance)
const SPORTS = ['padel', 'tennis', 'football'] as const
const STATUSES = ['active', 'maintenance'] as const

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
      .is('deleted_at', null) // archived courts are not listed
      .order('created_at', { ascending: false })

    if (sport) query = query.eq('sport', sport as Sport)
    if (status) query = query.eq('status', status as CourtStatus)

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
}, { permission: 'read' })

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

    let body: Record<string, unknown>
    try {
      const parsed = await request.json()
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      body = parsed as Record<string, unknown>
    } catch {
      return fail('Request body must be a JSON object', 400)
    }

    const parsed = apiCourtCreateSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      return NextResponse.json(
        { success: false, error: `${first.path.join('.') || 'body'}: ${first.message}`, issues: parsed.error.issues },
        { status: 400 }
      )
    }
    const v = parsed.data

    const row: CourtInsert = {
      org_id: organizationId,
      name: v.name,
      sport: (v.sport ?? v.sport_type) as Sport,
      price_per_hour: v.price_per_hour,
      status: (v.status ?? (v.is_active === false ? 'maintenance' : 'active')) as CourtStatus,
    }
    for (const key of ['open_time', 'close_time', 'night_starts_at'] as const) {
      if (v[key]) row[key] = v[key]
    }
    if (v.night_surcharge_per_hour != null) row.night_surcharge_per_hour = v.night_surcharge_per_hour

    const { data: court, error } = await getSupabaseAdmin()
      .from('courts')
      .insert(row)
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
}, { permission: 'write' })
