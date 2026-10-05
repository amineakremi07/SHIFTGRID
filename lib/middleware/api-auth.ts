import 'server-only' // build error if a Client Component ever imports this (it holds the service-role key)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reportServerError } from '@/lib/observability'

// Create a service client for server-side operations
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface ApiKeyValidationResult {
  valid: boolean
  organizationId?: string
  permissions?: string[]
  rateLimit?: number
  error?: string
}

/**
 * Validate an API key from the Authorization header
 * Returns validation result with organization context
 */
export async function validateApiKey(request: NextRequest): Promise<ApiKeyValidationResult> {
  const authHeader = request.headers.get('authorization')

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid Authorization header' }
  }

  const apiKey = authHeader.substring(7).trim() // Remove 'Bearer ' prefix

  if (!apiKey || !apiKey.startsWith('sg_live_')) {
    return { valid: false, error: 'Invalid API key format' }
  }

  try {
    const supabaseAdmin = getSupabaseAdmin()

    // Use the database function for validation
    const { data, error } = await supabaseAdmin.rpc('verify_api_key', {
      input_key: apiKey
    })

    if (error) {
      console.error('API key validation error:', error)
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
    console.error('API key validation error:', error)
    reportServerError('api.key-validation', error)
    return { valid: false, error: 'Validation failed' }
  }
}

/**
 * Create a middleware wrapper for API routes that require API key authentication
 */
export function withApiKeyAuth(
  handler: (request: NextRequest, context: { organizationId: string; permissions: string[] }) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validateApiKey(request)

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error || 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if the required permission is present
    const requiredPermission = request.headers.get('x-required-permission')
    if (requiredPermission && validation.permissions && !validation.permissions.includes(requiredPermission)) {
      return NextResponse.json(
        { error: `Insufficient permissions. Required: ${requiredPermission}` },
        { status: 403 }
      )
    }

    // Add organization context to request headers for downstream use
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-organization-id', validation.organizationId!)
    requestHeaders.set('x-api-permissions', JSON.stringify(validation.permissions || []))

    // Create new request with updated headers
    const authenticatedRequest = new NextRequest(request.url, {
      method: request.method,
      headers: requestHeaders,
      body: request.body,
      signal: request.signal,
    })

    return handler(authenticatedRequest, {
      organizationId: validation.organizationId!,
      permissions: validation.permissions || [],
    })
  }
}

/**
 * Create a middleware for checking specific permissions
 */
export function requirePermission(permission: string) {
  return (request: NextRequest): { valid: boolean; error?: string } => {
    const permissionsHeader = request.headers.get('x-api-permissions')
    if (!permissionsHeader) {
      return { valid: false, error: 'Missing permissions context' }
    }

    try {
      const permissions = JSON.parse(permissionsHeader)
      if (!permissions.includes(permission)) {
        return { valid: false, error: `Permission '${permission}' required` }
      }
      return { valid: true }
    } catch {
      return { valid: false, error: 'Invalid permissions format' }
    }
  }
}

/**
 * Get organization ID from authenticated request
 */
export function getOrganizationId(request: NextRequest): string | null {
  return request.headers.get('x-organization-id')
}

/**
 * Get API permissions from authenticated request
 */
export function getApiPermissions(request: NextRequest): string[] {
  const permissionsHeader = request.headers.get('x-api-permissions')
  if (!permissionsHeader) return []
  try {
    return JSON.parse(permissionsHeader)
  } catch {
    return []
  }
}