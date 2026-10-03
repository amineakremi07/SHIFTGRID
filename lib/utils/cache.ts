/**
 * Cache utilities for server components and API routes
 * Provides in-memory caching with TTL for development
 * Use Redis or Vercel Edge Config for production
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

interface CacheOptions {
  ttl?: number // Time to live in milliseconds
  tags?: string[] // For cache invalidation
}

// In-memory cache (use Redis in production)
const memoryCache = new Map<string, CacheEntry<unknown>>()

/**
 * Generate a cache key from parts
 */
export function createCacheKey(...parts: (string | number | boolean)[]): string {
  return parts.map(String).join(':')
}

/**
 * Get cached data
 */
export function getCache<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined

  if (!entry) {
    return null
  }

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key)
    return null
  }

  return entry.data
}

/**
 * Set cached data
 */
export function setCache<T>(key: string, data: T, options: CacheOptions = {}): void {
  const { ttl = 60 * 1000 } = options // Default 1 minute
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttl,
  })
}

/**
 * Delete cached data
 */
export function deleteCache(key: string): void {
  memoryCache.delete(key)
}

/**
 * Delete cache by tag
 */
export function deleteCacheByTag(tag: string): void {
  void tag // placeholder until tag-based invalidation exists
  // In a real implementation, you'd maintain a tag index
  // For now, we'll just clear the entire cache
  // TODO: Implement proper tag-based invalidation with Redis
  memoryCache.clear()
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  memoryCache.clear()
}

/**
 * Cache wrapper for async functions
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cached = getCache<T>(key)
  if (cached !== null) {
    return cached
  }

  const data = await fn()
  setCache(key, data, options)
  return data
}

/**
 * React cache (for use in Server Components)
 * Uses Next.js unstable_cache for request-level caching
 */
export function unstableCache<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  keyParts: (string | number | boolean)[],
  options: { tags?: string[]; revalidate?: number } = {}
) {
  void options // placeholder: not forwarded until the real unstable_cache is used
  // This is a placeholder - in Next.js 15+, use the actual unstable_cache
  // import { unstable_cache } from 'next/cache'
  // return unstable_cache(fn, keyParts, options)
  return fn
}

/**
 * Cache headers for API responses
 */
export function getCacheHeaders(options: {
  maxAge?: number
  staleWhileRevalidate?: number
  mustRevalidate?: boolean
} = {}): Record<string, string> {
  const {
    maxAge = 60, // 1 minute default
    staleWhileRevalidate = 300, // 5 minutes default
    mustRevalidate = false,
  } = options

  const parts = [`public, max-age=${maxAge}`]

  if (staleWhileRevalidate > 0) {
    parts.push(`stale-while-revalidate=${staleWhileRevalidate}`)
  }

  if (mustRevalidate) {
    parts.push('must-revalidate')
  }

  return {
    'Cache-Control': parts.join(', '),
  }
}

/**
 * No-store cache headers (for sensitive data)
 */
export function getNoStoreHeaders(): Record<string, string> {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
  }
}

/**
 * ETag generation for conditional requests
 */
export function generateETag(data: unknown): string {
  const str = typeof data === 'string' ? data : JSON.stringify(data)
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return `"${hash.toString(16)}"`
}

/**
 * Check if ETag matches
 */
export function checkETag(request: Request, etag: string): boolean {
  const ifNoneMatch = request.headers.get('if-none-match')
  return ifNoneMatch === etag
}

/**
 * Create a cached response
 */
export function createCachedResponse<T>(
  data: T,
  options: {
    maxAge?: number
    staleWhileRevalidate?: number
    etag?: string
  } = {}
) {
  const etag = options.etag || generateETag(data)
  const headers = getCacheHeaders({
    maxAge: options.maxAge,
    staleWhileRevalidate: options.staleWhileRevalidate,
  })

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ETag: etag,
      ...headers,
    },
  })
}

/**
 * Create a 304 Not Modified response
 */
export function createNotModifiedResponse(): Response {
  return new Response(null, { status: 304 })
}

/**
 * Pagination cache key generator
 */
export function createPaginationCacheKey(
  baseKey: string,
  page: number,
  limit: number,
  filters?: Record<string, unknown>
): string {
  const filterStr = filters ? JSON.stringify(filters) : 'no-filters'
  return createCacheKey(baseKey, `page:${page}`, `limit:${limit}`, filterStr)
}