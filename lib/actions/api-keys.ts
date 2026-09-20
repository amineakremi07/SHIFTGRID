'use server'

import { createClient } from '@/lib/supabase/server'
import { createApiKeySchema, CreateApiKeyInput } from '@/lib/validations/api'

// Create a new API key using database function
export async function createApiKey(input: CreateApiKeyInput) {
  try {
    const validatedInput = createApiKeySchema.parse(input)

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Get user's organization
    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return { success: false, error: 'No organization found for user' }
    }

    // Check permissions - only company_admin can create API keys
    if (profile.role !== 'company_admin' && profile.role !== 'platform_admin') {
      return { success: false, error: 'Insufficient permissions to create API keys' }
    }

    // Call database function to generate API key
    const { data, error } = await supabase.rpc('generate_api_key', {
      p_organization_id: profile.organization_id,
      p_name: validatedInput.name,
      p_permissions: validatedInput.permissions,
      p_rate_limit: validatedInput.rate_limit,
      p_expires_at: validatedInput.expires_at || null,
    })

    if (error) {
      console.error('Create API key error:', error)
      return { success: false, error: 'Failed to create API key' }
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'Failed to create API key' }
    }

    const result = data[0]

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
    console.error('Create API key error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// List API keys for organization
export async function listApiKeys() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return { success: false, error: 'No organization found for user' }
    }

    // Check permissions
    if (profile.role !== 'company_admin' && profile.role !== 'platform_admin' && profile.role !== 'staff') {
      return { success: false, error: 'Insufficient permissions' }
    }

    const { data: apiKeys, error } = await supabase
      .from('api_keys')
      .select('id, name, prefix, permissions, rate_limit, expires_at, last_used_at, is_active, created_at')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: apiKeys }
  } catch (error) {
    console.error('List API keys error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// Revoke/Delete API key using database function
export async function revokeApiKey(apiKeyId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return { success: false, error: 'No organization found' }
    }

    // Check permissions
    if (profile.role !== 'company_admin' && profile.role !== 'platform_admin') {
      return { success: false, error: 'Insufficient permissions' }
    }

    // Call database function to revoke API key
    const { error } = await supabase.rpc('revoke_api_key', {
      p_key_id: apiKeyId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error('Revoke API key error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}

// Validate API key (for API route authentication) using database function
export async function validateApiKey(key: string): Promise<{
  valid: boolean
  organizationId?: string
  permissions?: string[]
  rateLimit?: number
  error?: string
}> {
  try {
    if (!key || !key.startsWith('sg_live_')) {
      return { valid: false, error: 'Invalid API key format' }
    }

    const supabase = await createClient()

    const { data, error } = await supabase.rpc('verify_api_key', {
      input_key: key,
    })

    if (error) {
      console.error('Validate API key error:', error)
      return { valid: false, error: 'Validation failed' }
    }

    if (!data || data.length === 0) {
      return { valid: false, error: 'Invalid API key' }
    }

    const result = data[0]
    return {
      valid: result.valid,
      organizationId: result.organization_id,
      permissions: result.permissions,
      rateLimit: result.rate_limit,
      error: result.error,
    }
  } catch (error) {
    console.error('Validate API key error:', error)
    return { valid: false, error: 'Validation failed' }
  }
}