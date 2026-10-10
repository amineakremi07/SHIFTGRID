'use server'

import { z } from 'zod'

import { getSessionProfile, requireOrgAction } from '@/lib/org-access'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'
import { captureAudit } from '@/lib/telemetry'
import { createApiKeySchema, CreateApiKeyInput } from '@/lib/validations/api'

/**
 * API keys of the caller's own club. The key RPCs are service-role only (they are not callable
 * through the REST API), so every call here first proves the caller with `requireOrgAction`, then
 * passes the club and creator explicitly: both come from the verified session, never from input.
 * Keys are verified on the API side by `validateApiKey` in lib/middleware/api-auth.ts.
 */

// Create a new API key. Owner only; the full key is returned once.
export async function createApiKey(input: CreateApiKeyInput) {
  try {
    const parsed = createApiKeySchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: 'Invalid input', fieldErrors: parsed.error.flatten().fieldErrors }
    }
    const validatedInput = parsed.data

    const auth = await requireOrgAction(['org_admin'])
    if (!auth.ok) return { success: false, error: auth.message }

    const { data, error } = await getSupabaseAdmin().rpc('generate_api_key', {
      p_organization_id: auth.ctx.orgId,
      p_name: validatedInput.name,
      p_permissions: validatedInput.permissions,
      p_rate_limit: validatedInput.rate_limit,
      p_expires_at: validatedInput.expires_at || null,
      p_created_by: auth.ctx.userId,
    })

    if (error || !data || data.length === 0) {
      console.error('Create API key error:', error?.message)
      return { success: false, error: 'Failed to create API key' }
    }

    const result = data[0]
    captureAudit({ action: 'api_key.create', status: 'created', org_id: auth.ctx.orgId, actor: auth.ctx.role })

    // Return the full key only once - it cannot be retrieved again
    return {
      success: true,
      data: {
        id: result.id,
        name: result.name,
        key: result.key, // Only returned once!
        prefix: result.prefix,
        permissions: result.permissions,
        created_at: result.created_at,
      },
    }
  } catch (error) {
    console.error('Create API key error:', error instanceof Error ? error.message : error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// List API keys (metadata only) of the caller's club. RLS is the second lock.
export async function listApiKeys() {
  try {
    const auth = await requireOrgAction(['org_admin'])
    if (!auth.ok) return { success: false, error: auth.message }

    const { supabase } = await getSessionProfile() // same request client as the access check: no second getUser()
    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, name, prefix, permissions, rate_limit, expires_at, last_used_at, is_active, created_at')
      .eq('organization_id', auth.ctx.orgId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('List API keys error:', error.message)
      return { success: false, error: 'Could not load API keys' }
    }
    return { success: true, data: apiKeys }
  } catch (error) {
    console.error('List API keys error:', error instanceof Error ? error.message : error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// Revoke one of the caller's own club's keys. Owner only.
export async function revokeApiKey(apiKeyId: string) {
  try {
    if (!z.string().uuid().safeParse(apiKeyId).success) return { success: false, error: 'Invalid key' }

    const auth = await requireOrgAction(['org_admin'])
    if (!auth.ok) return { success: false, error: auth.message }

    const { error } = await getSupabaseAdmin().rpc('revoke_api_key', {
      p_key_id: apiKeyId,
      p_organization_id: auth.ctx.orgId,
    })
    if (error) return { success: false, error: 'API key not found' }

    captureAudit({ action: 'api_key.revoke', status: 'revoked', org_id: auth.ctx.orgId, actor: auth.ctx.role })
    return { success: true }
  } catch (error) {
    console.error('Revoke API key error:', error instanceof Error ? error.message : error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
