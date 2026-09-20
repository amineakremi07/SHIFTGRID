'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getSupabaseAdmin() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getPendingVerifications() {
  const supabase = await createClient()

  const { data: organizations, error } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      registry_number,
      address,
      sport_types,
      verification_documents,
      created_at,
      profiles!inner(
        display_name,
        phone,
        email
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching pending verifications:', error)
    return { organizations: [], error: error.message }
  }

  // Map sport_types to court counts
  const organizationsWithCourts = organizations?.map((org) => {
    const courtCounts = { padel: 0, tennis: 0, football: 0 }
    if (org.sport_types) {
      for (const sport of org.sport_types) {
        if (sport in courtCounts) {
          courtCounts[sport as keyof typeof courtCounts]++
        }
      }
    }
    return { ...org, courtCounts }
  })

  return { organizations: organizationsWithCourts, error: null }
}

export async function getOrganizationById(orgId: string) {
  const supabase = await createClient()

  const { data: organization, error } = await supabase
    .from('organizations')
    .select(`
      id,
      name,
      registry_number,
      address,
      sport_types,
      verification_documents,
      created_at,
      profiles!inner(
        display_name,
        phone,
        email
      )
    `)
    .eq('id', orgId)
    .single()

  if (error || !organization) {
    return { organization: null, error: error?.message || 'Organization not found' }
  }

  return { organization, error: null }
}

export async function getVerificationDocumentUrl(orgId: string) {
  const { data: organization, error } = await getSupabaseAdmin()
    .from('organizations')
    .select('verification_documents')
    .eq('id', orgId)
    .single()

  if (error || !organization?.verification_documents?.proof) {
    return { url: null, error: error?.message || 'No verification document found' }
  }

  return { url: organization.verification_documents.proof, error: null }
}

export async function approveOrganization(orgId: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') {
    return { success: false, error: 'Access denied. Platform admin access required.' }
  }

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({
      status: 'approved',
      verified_at: new Date().toISOString(),
      verified_by: user.id,
    })
    .eq('id', orgId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/verifications')
  return { success: true, message: 'Organization approved successfully' }
}

export async function rejectOrganization(orgId: string, reason: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: 'Unauthorized' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') {
    return { success: false, error: 'Access denied. Platform admin access required.' }
  }

  const { error } = await getSupabaseAdmin()
    .from('organizations')
    .update({
      status: 'rejected',
      verified_at: new Date().toISOString(),
      verified_by: user.id,
      verification_documents: {
        rejection_reason: reason,
      },
    })
    .eq('id', orgId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/verifications')
  return { success: true, message: 'Organization rejected' }
}

export async function downloadVerificationDocument(orgId: string) {
  const { data: organization, error } = await getSupabaseAdmin()
    .from('organizations')
    .select('verification_documents')
    .eq('id', orgId)
    .single()

  if (error || !organization?.verification_documents?.proof) {
    return { success: false, error: 'No verification document found' }
  }

  const docUrl = organization.verification_documents.proof

  try {
    const response = await fetch(docUrl)
    if (!response.ok) {
      throw new Error('Failed to download document')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `verification-doc-${orgId}.${docUrl.split('.').pop() || 'pdf'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)

    return { success: true }
  } catch (err) {
    return { success: false, error: 'Failed to download document' }
  }
}
