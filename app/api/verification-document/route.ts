import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')

    if (!orgId) {
      return NextResponse.json({ success: false, error: 'Organization ID is required' }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()

    const { data: organization, error } = await supabaseAdmin
      .from('organizations')
      .select('verification_documents')
      .eq('id', orgId)
      .single()

    if (error || !organization?.verification_documents?.proof) {
      return NextResponse.json({ success: false, error: error?.message || 'No verification document found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, url: organization.verification_documents.proof })
  } catch (error) {
    console.error('Get verification document error:', error)
    return NextResponse.json({ success: false, error: 'An unexpected error occurred' }, { status: 500 })
  }
}