'use client'

import { useEffect } from 'react'
import { reportWebVitals } from '@/lib/utils/performance'

/**
 * Web Vitals tracking component
 * Reports Core Web Vitals to the analytics endpoint
 * Callers: Root layout (_app.tsx or layout.tsx), page components
 * Affected API: POST /api/analytics/web-vitals (via reportWebVitals)
 * Data schemas: WebVitals metrics {name, value, id} from web-vitals library
 * User instruction: Implement performance monitoring for Core Web Vitals
 */
export function WebVitals() {
  useEffect(() => {
    // Only run in browser
    if (typeof window === 'undefined') return

    // Import web-vitals library dynamically
    import('web-vitals').then(({ onCLS, onLCP, onFCP, onTTFB, onINP }) => {
      // Report each metric
      // onFID removed in web-vitals v4+ — superseded by INP
      onCLS(reportWebVitals)
      onLCP(reportWebVitals)
      onFCP(reportWebVitals)
      onTTFB(reportWebVitals)
      onINP(reportWebVitals)
    }).catch(() => {
      // web-vitals not installed, silently fail
      console.debug('web-vitals package not installed, skipping Web Vitals tracking')
    })

    // Track memory usage periodically
    const memoryInterval = setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory
        if (memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.9) {
          console.warn('High memory usage detected:', {
            used: Math.round(memory.usedJSHeapSize / 1024 / 1024) + ' MB',
            limit: Math.round(memory.jsHeapSizeLimit / 1024 / 1024) + ' MB',
          })
        }
      }
    }, 30000) // Every 30 seconds

    return () => clearInterval(memoryInterval)
  }, [])

  return null // This component renders nothing
}

/**
 * Custom hook to track component render performance
 * Callers: Any React component wanting render time tracking
 * Affected API: Console debug output, performance.now()
 * Data schemas: None
 */
export function useRenderTracking(componentName: string) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const start = performance.now()
      return () => {
        const duration = performance.now() - start
        if (duration > 16) { // Log if render took longer than 1 frame (16ms)
          console.debug(`Render: ${componentName} took ${duration.toFixed(2)}ms`)
        }
      }
    }
  })
}

/**
 * Hook to track API call performance
 * Callers: Client components making API calls
 * Affected API: POST /api/analytics/web-vitals
 * Data schemas: API timing metrics {name, value, url, timestamp, userAgent}
 */
export function useApiTracking() {
  const trackApiCall = async <T,>(
    endpoint: string,
    method: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    const start = performance.now()
    try {
      const result = await fn()
      const duration = performance.now() - start
      // In production, send to analytics endpoint
      if (typeof window !== 'undefined') {
        fetch('/api/analytics/web-vitals', {
          method: 'POST',
          body: JSON.stringify({
            name: `api:${method}:${endpoint}`,
            value: duration,
            url: window.location.href,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
          }),
          keepalive: true,
        }).catch(() => {})
      }
      return result
    } catch (error) {
      const duration = performance.now() - start
      if (typeof window !== 'undefined') {
        fetch('/api/analytics/web-vitals', {
          method: 'POST',
          body: JSON.stringify({
            name: `api:${method}:${endpoint}:error`,
            value: duration,
            url: window.location.href,
            timestamp: Date.now(),
            userAgent: navigator.userAgent,
          }),
          keepalive: true,
        }).catch(() => {})
      }
      throw error
    }
  }

  return { trackApiCall }
}