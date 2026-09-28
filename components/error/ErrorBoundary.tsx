'use client'

import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

/**
 * Error Boundary for catching React component errors
 * Callers: Layout components, page components, section wrappers
 * Affected API: React error boundary lifecycle methods (getDerivedStateFromError, componentDidCatch)
 * Data schemas: Error, ErrorInfo (React built-in types)
 * User instruction: Implement error boundaries for graceful error handling
 */
interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    })

    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo)
    }

    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, errorInfo)
    }

    this.props.onError?.(error, errorInfo)
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    fetch('/api/analytics/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: Date.now(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      }),
      keepalive: true,
    }).catch(() => {})
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">Something went wrong</h2>
            <p className="mb-6 text-muted-foreground">
              We apologize for the inconvenience. Our team has been notified.
            </p>

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 text-left rounded border p-4 bg-muted">
                <summary className="cursor-pointer font-mono text-sm">
                  Error Details (Development)
                </summary>
                <pre className="mt-2 overflow-auto text-xs text-red-600">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex gap-4 justify-center">
              <Button onClick={this.handleRetry} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button variant="outline" asChild>
                <Link href="/">
                  <Home className="mr-2 h-4 w-4" />
                  Go Home
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function SectionErrorBoundary({
  children,
  fallback,
  sectionName,
}: {
  children: ReactNode
  fallback?: ReactNode
  sectionName?: string
}) {
  return (
    <ErrorBoundary
      fallback={fallback}
      onError={(error) => {
        console.error(`Error in ${sectionName || 'section'}:`, error)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}

export function AsyncErrorBoundary({
  children,
  fallback,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return (
    <ErrorBoundary
      fallback={fallback ?? (
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-destructive" />
            <p className="text-muted-foreground">Failed to load component</p>
          </div>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}