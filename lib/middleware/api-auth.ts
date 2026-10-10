import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { reportServerError } from '@/lib/observability'
import { rateLimit, tooManyRequests, type RateResult } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase/optimized-client'

export interface ApiKeyValidationResult {
  valid: boolean
  organizationId?: string
  permissions?: string[]
  rateLimit?: number
  error?: string
  /** Set when the key is valid but over its own limit: answer 429 with these hints. */
  limited?: RateResult
}

/** A key's stored `rate_limit` is requests per hour. */
const KEY_WINDOW_SEC = 3600


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
    if (!result.valid) return { valid: false, error: result.error ?? 'Invalid API key' }

    // The key's own stored limit (per hour), counted per key prefix so every IP shares it.
    const limited = await rateLimit('api', `key:${apiKey.slice(0, 12)}`, '/api/v1', {
      max: Math.max(1, result.rate_limit || 1000),
      windowSec: KEY_WINDOW_SEC,
    })
    if (!limited.ok) {
      return { valid: false, error: 'API key rate limit exceeded', limited }
    }

    return {
      valid: true,
      organizationId: result.organization_id ?? undefined,
      permissions: result.permissions,
      rateLimit: result.rate_limit,
    }
  } catch (error) {
    console.error('API key validation error:', error)
    reportServerError('api.key-validation', error)
    return { valid: false, error: 'Validation failed' }
  }
}

/**
 * Wrap an API route that requires an API key. Pass the permission the route needs explicitly
 * (`withApiKeyAuth(handler, { permission: 'write' })`); a key holding `admin` passes every check.
 * The club comes from the key, never from the request.
 */
export function withApiKeyAuth(
  handler: (request: NextRequest, context: { organizationId: string; permissions: string[] }) => Promise<NextResponse>,
  options: { permission?: string } = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const validation = await validateApiKey(request)

    if (validation.limited) return tooManyRequests(validation.limited)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error || 'Unauthorized' }, { status: 401 })
    }

    const permissions = validation.permissions ?? []
    const required = options.permission
    if (required && !permissions.includes(required) && !permissions.includes('admin')) {
      return NextResponse.json({ error: `Insufficient permissions. Required: ${required}` }, { status: 403 })
    }

    return handler(request, { organizationId: validation.organizationId!, permissions })
  }
}
