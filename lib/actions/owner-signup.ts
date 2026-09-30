'use server'

import type { Database } from '@/lib/types/database'
import { createAdminClient, serviceRoleKeyProblem } from '@/lib/supabase/optimized-client'
import { ownerSignupSchema, type OwnerSignupData } from '@/lib/validations/owner-signup'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'

// Clients are created inside the action, not here. Constructing them at import
// time made merely importing this file (and so rendering /register) throw
// whenever RESEND_API_KEY or the service-role key was missing.

export async function submitOwnerSignup(formData: OwnerSignupData) {
  const validated = ownerSignupSchema.safeParse(formData)
  if (!validated.success) {
    return { success: false, error: 'Invalid form data', details: validated.error.flatten() }
  }

  const { company, location, document, owner } = validated.data

  // What this signup has created so far, so a failure at ANY step can undo it and
  // leave no orphaned auth user, stored file or organization behind.
  const created: { ownerId?: string; docPath?: string; orgId?: string } = {}
  let rollback: () => Promise<void> = async () => {}

  try {
    // Signup runs before anyone has a session, so every write here (auth user,
    // storage upload, organization, profile, courts) uses the service-role client.
    // Never the cookie-based user client: it has no JWT yet.
    const keyProblem = serviceRoleKeyProblem()
    if (keyProblem) {
      console.error('Owner signup blocked:', keyProblem)
      return {
        success: false,
        error: 'Registration is temporarily unavailable (server configuration). Please contact support.',
      }
    }
    const supabaseAdmin = createAdminClient()

    rollback = async () => {
      // Children first. Organization deletion cascades to courts and profiles.
      if (created.orgId) await supabaseAdmin.from('organizations').delete().eq('id', created.orgId)
      if (created.docPath) await supabaseAdmin.storage.from('verification-docs').remove([created.docPath])
      if (created.ownerId) await supabaseAdmin.auth.admin.deleteUser(created.ownerId)
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: owner.ownerEmail,
      password: owner.password,
      email_confirm: true,
      user_metadata: {
        display_name: owner.ownerName,
        phone: owner.ownerPhone,
      }
    })

    if (authError || !authData.user) {
      return { success: false, error: authError?.message || 'Failed to create user account' }
    }

    const ownerId = authData.user.id
    created.ownerId = ownerId

    // The proof goes into a PRIVATE bucket; only the object path is stored, and
    // admins open it through a short-lived signed URL (see admin-verification.ts).
    let docPath: string | null = null
    if (document.verificationDoc) {
      const fileExt = document.verificationDoc.name.split('.').pop()
      const fileName = `${ownerId}-${Date.now()}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('verification-docs')
        .upload(fileName, document.verificationDoc)

      if (uploadError) {
        console.error('Verification document upload failed:', uploadError.message)
        await rollback()
        return { success: false, error: 'Failed to upload verification document' }
      }
      docPath = uploadData.path
      created.docPath = docPath
    }

    const fullAddress = `${company.address}, ${company.city}${company.postalCode ? `, ${company.postalCode}` : ''}, Tunisia`

    const { data: orgData, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: company.companyName,
        address: fullAddress,
        // Structured fields the public club search reads (city label, distance).
        city: company.city,
        latitude: location.latitude,
        longitude: location.longitude,
        sport_types: company.sportTypes,
        timezone: 'Africa/Tunis',
        status: 'pending',
        registry_number: company.registryNumber || null,
        verification_documents: docPath ? { path: docPath, name: document.verificationDoc?.name ?? null } : {},
      })
      .select('id')
      .single()

    if (orgError || !orgData) {
      console.error('Organization insert failed:', { code: orgError?.code, message: orgError?.message })
      await rollback()
      return { success: false, error: 'Failed to create organization. Please try again.' }
    }

    const orgId = orgData.id
    created.orgId = orgId

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: ownerId,
        org_id: orgId,
        role: 'org_admin',
        display_name: owner.ownerName,
        phone: owner.ownerPhone,
      })

    if (profileError) {
      console.error('Owner profile insert failed:', { code: profileError.code, message: profileError.message })
      await rollback()
      return { success: false, error: 'Failed to create owner profile' }
    }

    const courtsToInsert: Database['public']['Tables']['courts']['Insert'][] = []
    let courtCounter = 1

    for (const sport of company.sportTypes) {
      const count = company.courtCounts[sport as keyof typeof company.courtCounts] || 0
      for (let i = 0; i < count; i++) {
        courtsToInsert.push({
          org_id: orgId,
          sport,
          name: `${sport.charAt(0).toUpperCase() + sport.slice(1)} Court ${courtCounter++}`,
          status: 'active' as const,
          open_time: company.openTime,
          close_time: company.closeTime,
        })
      }
    }

    if (courtsToInsert.length > 0) {
      const { error: courtsError } = await supabaseAdmin
        .from('courts')
        .insert(courtsToInsert)

      if (courtsError) {
        console.error('Courts creation failed:', { code: courtsError.code, message: courtsError.message })
        await rollback()
        return { success: false, error: 'Failed to create your courts. Please try again.' }
      }
    }

    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'ShiftGrid <noreply@shiftgrid.tn>',
        to: process.env.ADMIN_EMAIL!,
        subject: `New Organization Pending Verification: ${company.companyName}`,
        html: `
          <h2>New Organization Requires Verification</h2>
          <p><strong>Company:</strong> ${company.companyName}</p>
          <p><strong>Owner:</strong> ${owner.ownerName} (${owner.ownerEmail})</p>
          <p><strong>Phone:</strong> ${owner.ownerPhone}</p>
          <p><strong>Address:</strong> ${fullAddress}</p>
          <p><strong>Registry Number:</strong> ${company.registryNumber || 'Not provided'}</p>
          <p><strong>Sports:</strong> ${company.sportTypes.join(', ')}</p>
          <p><strong>Courts:</strong> ${JSON.stringify(company.courtCounts)}</p>
          <p><strong>Hours:</strong> ${company.openTime} - ${company.closeTime}</p>
          <p><strong>Employees:</strong> ${company.employeeCount}</p>
          <p><strong>Location:</strong> ${location.latitude}, ${location.longitude}</p>
          <p><strong>Document:</strong> ${docPath ? 'Uploaded (open it in the portal)' : 'None provided'}</p>
          <hr>
          <p>Review and approve/reject at: <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/verification">${process.env.NEXT_PUBLIC_APP_URL}/admin/verification</a></p>
        `,
      })
    } catch (emailError) {
      console.error('Admin notification email failed:', emailError)
    }

    try {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'ShiftGrid <noreply@shiftgrid.tn>',
        to: owner.ownerEmail,
        subject: 'Your ShiftGrid Organization Registration Received',
        html: `
          <h2>Registration Received</h2>
          <p>Hi ${owner.ownerName},</p>
          <p>We've received your registration for <strong>${company.companyName}</strong>.</p>
          <p>Your application is now <strong>pending verification</strong>. Our team will review your details and documents, then contact you to complete the setup.</p>
          <p>You'll receive another email once your organization is approved and ready to use.</p>
          <hr>
          <p>Contact: support@shiftgrid.tn</p>
        `,
      })
    } catch (emailError) {
      console.error('Owner confirmation email failed:', emailError)
    }

    revalidatePath('/admin/verification')
    return { success: true, orgId, message: 'Registration submitted successfully. You will be contacted for verification.' }

  } catch (error) {
    console.error('Owner signup error:', error instanceof Error ? error.message : 'unknown')
    // An exception after some records exist must not leave them orphaned.
    await rollback().catch((e) => console.error('Owner signup rollback failed:', e instanceof Error ? e.message : 'unknown'))
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

export async function checkRegistryNumber(registryNumber: string) {
  if (!/^\d{14}$/.test(registryNumber)) {
    return { valid: false, message: 'Registry number must be 14 digits' }
  }
  return { valid: true, message: 'Format valid (manual verification required)' }
}

export async function geocodeAddress(address: string) {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=tn&limit=1`,
      { headers: { 'User-Agent': 'ShiftGrid/1.0' } }
    )
    const data = await response.json()
    if (data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name,
      }
    }
    return null
  } catch {
    return null
  }
}