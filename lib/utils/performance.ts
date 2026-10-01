/**
 * Performance monitoring utilities
 * Track Core Web Vitals, API response times, and database query performance
 */

import { getCache, setCache } from './cache'

// Performance metrics storage (in-memory for dev, use analytics service in prod)
const performanceMetrics: PerformanceMetric[] = []

export interface PerformanceMetric {
  name: string
  value: number
  unit: 'ms' | 'bytes' | 'count'
  timestamp: number
  tags?: Record<string, string>
}

export interface WebVitals {
  cls?: number // Cumulative Layout Shift
  fid?: number // First Input Delay
  lcp?: number // Largest Contentful Paint
  fcp?: number // First Contentful Paint
  ttfb?: number // Time to First Byte
  inp?: number // Interaction to Next Paint
}

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - start
    recordMetric(name, duration, 'ms', tags)
    return result
  } catch (error) {
    const duration = performance.now() - start
    recordMetric(`${name}:error`, duration, 'ms', { ...tags, error: 'true' })
    throw error
  }
}

/**
 * Measure execution time of a synchronous function
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  tags?: Record<string, string>
): T {
  const start = performance.now()
  try {
    const result = fn()
    const duration = performance.now() - start
    recordMetric(name, duration, 'ms', tags)
    return result
  } catch (error) {
    const duration = performance.now() - start
    recordMetric(`${name}:error`, duration, 'ms', { ...tags, error: 'true' })
    throw error
  }
}

/**
 * Record a performance metric
 */
export function recordMetric(
  name: string,
  value: number,
  unit: 'ms' | 'bytes' | 'count' = 'ms',
  tags?: Record<string, string>
): void {
  const metric: PerformanceMetric = {
    name,
    value,
    unit,
    timestamp: Date.now(),
    tags,
  }

  performanceMetrics.push(metric)

  // Keep only last 1000 metrics in memory
  if (performanceMetrics.length > 1000) {
    performanceMetrics.shift()
  }

  // Log slow operations in development
  if (process.env.NODE_ENV === 'development' && unit === 'ms' && value > 1000) {
    console.warn(`⚠️ Slow operation: ${name} took ${value.toFixed(2)}ms`, tags)
  }
}

/**
 * Get performance metrics (optionally filtered)
 */
export function getMetrics(filters?: {
  name?: string
  since?: number
  limit?: number
}): PerformanceMetric[] {
  let metrics = [...performanceMetrics]

  if (filters?.name) {
    metrics = metrics.filter(m => m.name.includes(filters.name!))
  }

  if (filters?.since) {
    metrics = metrics.filter(m => m.timestamp >= filters.since!)
  }

  if (filters?.limit) {
    metrics = metrics.slice(-filters.limit)
  }

  return metrics
}

/**
 * Get aggregated metrics (avg, min, max, p50, p95, p99)
 */
export function getAggregatedMetrics(name: string, since?: number): {
  count: number
  avg: number
  min: number
  max: number
  p50: number
  p95: number
  p99: number
} | null {
  const metrics = getMetrics({ name, since })
  if (metrics.length === 0) return null

  const values = metrics.map(m => m.value).sort((a, b) => a - b)

  const percentile = (arr: number[], p: number) => {
    const index = Math.ceil(arr.length * p) - 1
    return arr[Math.max(0, index)]
  }

  return {
    count: values.length,
    avg: values.reduce((a, b) => a + b, 0) / values.length,
    min: values[0],
    max: values[values.length - 1],
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  }
}

/**
 * Web Vitals reporting (client-side)
 * Call this in a Client Component to report vitals
 */
export function reportWebVitals(metric: { name: string; value: number; id: string }) {
  const { name, value } = metric

  // Send to analytics endpoint
  if (typeof window !== 'undefined') {
    const body = JSON.stringify({
      name,
      value,
      url: window.location.href,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
    })

    // Use sendBeacon for reliable delivery
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/web-vitals', body)
    } else {
      fetch('/api/analytics/web-vitals', {
        method: 'POST',
        body,
        keepalive: true,
      }).catch(() => {})
    }
  }
}

/**
 * Database query performance tracking
 */
export function trackQuery(
  queryName: string,
  duration: number,
  rowCount?: number
): void {
  recordMetric(`db:${queryName}`, duration, 'ms', {
    type: 'database',
    rows: rowCount?.toString() || 'unknown',
  })
}

/**
 * API response time tracking
 */
export function trackApiResponse(
  endpoint: string,
  method: string,
  duration: number,
  statusCode: number
): void {
  recordMetric(`api:${method}:${endpoint}`, duration, 'ms', {
    type: 'api',
    method,
    status: statusCode.toString(),
  })
}

/**
 * Bundle size tracking (for build-time analysis)
 */
export function trackBundleSize(chunkName: string, size: number): void {
  recordMetric(`bundle:${chunkName}`, size, 'bytes', {
    type: 'bundle',
  })
}

/**
 * Memory usage tracking
 */
export function trackMemoryUsage(): void {
  if (typeof performance !== 'undefined' && 'memory' in performance) {
    const memory = (performance as Performance & {
      memory: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
    }).memory
    recordMetric('memory:used', memory.usedJSHeapSize, 'bytes', { type: 'memory' })
    recordMetric('memory:total', memory.totalJSHeapSize, 'bytes', { type: 'memory' })
    recordMetric('memory:limit', memory.jsHeapSizeLimit, 'bytes', { type: 'memory' })
  }
}

/**
 * Clear performance metrics
 */
export function clearMetrics(): void {
  performanceMetrics.length = 0
}

/**
 * Export metrics for external monitoring
 */
export function exportMetrics(): string {
  return JSON.stringify(performanceMetrics, null, 2)
}

/**
 * Next.js Server Component timing helper
 */
export function createServerTimer(name: string) {
  const start = process.hrtime.bigint()
  return {
    end: (tags?: Record<string, string>) => {
      const end = process.hrtime.bigint()
      const durationMs = Number(end - start) / 1_000_000
      recordMetric(name, durationMs, 'ms', { ...tags, runtime: 'server' })
      return durationMs
    },
  }
}

/**
 * Client-side timer (for browser)
 */
export function createClientTimer(name: string) {
  const start = performance.now()
  return {
    end: (tags?: Record<string, string>) => {
      const durationMs = performance.now() - start
      recordMetric(name, durationMs, 'ms', { ...tags, runtime: 'client' })
      return durationMs
    },
  }
}

/**
 * React component render tracking (development only)
 */
export function trackRender(componentName: string) {
  if (process.env.NODE_ENV === 'development') {
    const timer = createClientTimer(`render:${componentName}`)
    return () => timer.end()
  }
  return () => {}
}