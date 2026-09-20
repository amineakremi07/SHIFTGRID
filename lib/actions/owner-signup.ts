'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { ownerSignupSchema, type OwnerSignupData } from '@/lib/validations/owner-signup'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function submitOwnerSignup(formData: OwnerSignupData) {
  const validated = ownerSignupSchema.safeParse(formData)
  if (!validated.success) {
    return { success: false, error: 'Invalid form data', details: validated.error.flatten() }
  }

  const { company, location, document, owner } = validated.data

  try {
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

    const { error: identityError } = await supabaseAdmin
      .from('identities')
      .insert({
        id: ownerId,
        user_id: ownerId,
        provider_id: ownerId,
        identity_data: { email: owner.ownerEmail },
        provider: 'email',
      })

    if (identityError) {
      console.error('Identity creation error:', identityError)
    }

    let docUrl: string | null = null
    if (document.verificationDoc) {
      const fileExt = document.verificationDoc.name.split('.').pop()
      const fileName = `${ownerId}-${Date.now()}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
        .from('verification-docs')
        .upload(fileName, document.verificationDoc)

      if (uploadError) {
        return { success: false, error: 'Failed to upload verification document' }
      }

      const { data: urlData } = supabaseAdmin.storage
        .from('verification-docs')
        .getPublicUrl(uploadData.path)
      docUrl = urlData.publicUrl
    }

    const fullAddress = `${company.address}, ${company.city}${company.postalCode ? `, ${company.postalCode}` : ''}, Tunisia`

    const { data: orgData, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: company.companyName,
        address: fullAddress,
        sport_types: company.sportTypes,
        timezone: 'Africa/Tunis',
        status: 'pending',
        registry_number: company.registryNumber || null,
        verification_documents: docUrl ? { proof: docUrl } : {},
      })
      .select('id')
      .single()

    if (orgError || !orgData) {
      await supabaseAdmin.auth.admin.deleteUser(ownerId)
      return { success: false, error: orgError?.message || 'Failed to create organization' }
    }

    const orgId = orgData.id

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
      await supabaseAdmin.from('organizations').delete().eq('id', orgId)
      await supabaseAdmin.auth.admin.deleteUser(ownerId)
      return { success: false, error: 'Failed to create owner profile' }
    }

    const courtsToInsert = []
    let courtCounter = 1

    for (const sport of company.sportTypes) {
      const count = company.courtCounts[sport as keyof typeof company.courtCounts] || 0
      for (let i = 0; i < count; i++) {
        courtsToInsert.push({
          org_id: orgId,
          sport,
          name: `${sport.charAt(0).toUpperCase() + sport.slice(1)} Court ${courtCounter++}`,
          status: 'active',
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
        console.error('Courts creation error:', courtsError)
      }
    }

    try {
      await resend.emails.send({
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
          <p><strong>Document:</strong> ${docUrl ? `<a href="${docUrl}">View Document</a>` : 'None provided'}</p>
          <hr>
          <p>Review and approve/reject at: <a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/verifications">${process.env.NEXT_PUBLIC_APP_URL}/admin/verifications</a></p>
        `,
      })
    } catch (emailError) {
      console.error('Admin notification email failed:', emailError)
    }

    try {
      await resend.emails.send({
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

    revalidatePath('/admin/verifications')
    return { success: true, orgId, message: 'Registration submitted successfully. You will be contacted for verification.' }

  } catch (error) {
    console.error('Owner signup error:', error)
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