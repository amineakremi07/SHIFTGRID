import { NextRequest, NextResponse } from 'next/server'
import { withApiKeyAuth, getOrganizationId } from '@/lib/middleware/api-auth'
import { createClient } from '@supabase/supabase-js'

// Create service client for database operations
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/v1/courts
 * List courts for the authenticated organization
 * Requires API key with 'read' permission
 */
export const GET = withApiKeyAuth(async (request: NextRequest, context) => {
  try {
    const organizationId = context.organizationId
    const supabase = getSupabaseAdmin()

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const sportType = searchParams.get('sport_type')
    const isActive = searchParams.get('is_active')

    let query = supabase
      .from('courts')
      .select('*', { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (sportType) {
      query = query.eq('sport_type', sportType)
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true')
    }

    const from = (page - 1) * limit
    const to = from + limit - 1
    query = query.range(from, to)

    const { data: courts, error, count } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: courts,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error('List courts error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
})

/**
 * POST /api/v1/courts
 * Create a new court
 * Requires API key with 'write' permission
 */
export const POST = withApiKeyAuth(async (request: NextRequest, context) => {
  try {
    const organizationId = context.organizationId

    // Check for write permission
    if (!context.permissions.includes('write') && !context.permissions.includes('admin')) {
      return NextResponse.json(
        { success: false, error: 'Write permission required' },
        { status: 403 }
      )
    }

    const supabase = getSupabaseAdmin()
    const body = await request.json()

    // Validate required fields
    const { name, sport_type, price_per_hour } = body

    if (!name || !sport_type || price_per_hour === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, sport_type, price_per_hour' },
        { status: 400 }
      )
    }

    const { data: court, error } = await supabase
      .from('courts')
      .insert({
        organization_id: organizationId,
        name,
        sport_type,
        price_per_hour,
        surface_type: body.surface_type,
        description: body.description,
        is_active: body.is_active ?? true,
        operating_hours: body.operating_hours,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, data: court },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create court error:', error)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
})