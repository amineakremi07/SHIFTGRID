'use server'

import type { Database } from '@/lib/types/database'
import { createAdminClient, serviceRoleKeyProblem } from '@/lib/supabase/optimized-client'
import { ownerSignupSchema, type OwnerSignupData } from '@/lib/validations/owner-signup'
import { revalidatePath } from 'next/cache'
import { deliver } from '@/lib/notifications/mailer'
import { esc } from '@/lib/notifications/templates'
import { actionRateLimit } from '@/lib/rate-limit'
import { consentMetadata } from '@/lib/legal'

// Clients are created inside the action, not here. Constructing them at import
// time made merely importing this file (and so rendering /register) throw
// whenever an email key or the service-role key was missing.

export async function submitOwnerSignup(formData: OwnerSignupData) {
  const limited = await actionRateLimit('auth')
  if (limited) return { success: false, error: limited }

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
        ...consentMetadata(),
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

    // deliver() never throws: a failed email must not undo a signup that is already saved.
    // Everything below was typed by the applicant, so it is escaped before reaching the HTML.
    const adminUrl = esc(`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/verification`)
    if (process.env.ADMIN_EMAIL) {
      const adminEmail = await deliver({
        to: process.env.ADMIN_EMAIL,
        subject: `New Organization Pending Verification: ${company.companyName}`,
        html: `
          <h2>New Organization Requires Verification</h2>
          <p><strong>Company:</strong> ${esc(company.companyName)}</p>
          <p><strong>Owner:</strong> ${esc(owner.ownerName)} (${esc(owner.ownerEmail)})</p>
          <p><strong>Phone:</strong> ${esc(owner.ownerPhone)}</p>
          <p><strong>Address:</strong> ${esc(fullAddress)}</p>
          <p><strong>Registry Number:</strong> ${esc(company.registryNumber || 'Not provided')}</p>
          <p><strong>Sports:</strong> ${esc(company.sportTypes.join(', '))}</p>
          <p><strong>Courts:</strong> ${esc(JSON.stringify(company.courtCounts))}</p>
          <p><strong>Hours:</strong> ${esc(company.openTime)} - ${esc(company.closeTime)}</p>
          <p><strong>Employees:</strong> ${esc(company.employeeCount)}</p>
          <p><strong>Location:</strong> ${esc(location.latitude)}, ${esc(location.longitude)}</p>
          <p><strong>Document:</strong> ${docPath ? 'Uploaded (open it in the portal)' : 'None provided'}</p>
          <hr>
          <p>Review and approve/reject at: <a href="${adminUrl}">${adminUrl}</a></p>
        `,
      })
      if (adminEmail.status !== 'sent') {
        console.error('Admin notification email not sent', { status: adminEmail.status, error: adminEmail.error })
      }
    } else {
      console.error('Admin notification email skipped: ADMIN_EMAIL is not set')
    }

    const ownerEmail = await deliver({
      to: owner.ownerEmail,
      subject: 'Your ShiftGrid Organization Registration Received',
      html: `
        <h2>Registration Received</h2>
        <p>Hi ${esc(owner.ownerName)},</p>
        <p>We've received your registration for <strong>${esc(company.companyName)}</strong>.</p>
        <p>Your application is now <strong>pending verification</strong>. Our team will review your details and documents, then contact you to complete the setup.</p>
        <p>You'll receive another email once your organization is approved and ready to use.</p>
        <hr>
        <p>Contact: support@shiftgrid.tn</p>
      `,
    })
    if (ownerEmail.status !== 'sent') {
      console.error('Owner confirmation email not sent', { status: ownerEmail.status, error: ownerEmail.error })
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
  const limited = await actionRateLimit('lookup')
  if (limited) return { valid: false, message: limited }

  if (!/^\d{14}$/.test(registryNumber)) {
    return { valid: false, message: 'Registry number must be 14 digits' }
  }
  return { valid: true, message: 'Format valid (manual verification required)' }
}

export async function geocodeAddress(address: string) {
  const limited = await actionRateLimit('lookup')
  if (limited) return null

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