'use client'

import { useState, useEffect } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DocumentViewer({ orgId, onClose }: { orgId: string; onClose?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchDocumentUrl = async () => {
      try {
        const response = await fetch(`/api/verification-document?orgId=${orgId}`)
        const data = await response.json()

        if (data.success) {
          setUrl(data.url)
        } else {
          setError(data.error || 'No document found')
        }
      } catch {
        setError('Failed to load document')
      } finally {
        setIsLoading(false)
      }
    }

    fetchDocumentUrl()
  }, [orgId])

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading document...</div>
  }

  if (error || !url) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
        <p className="text-muted-foreground">{error || 'No verification document uploaded'}</p>
        {onClose && (
          <Button variant="outline" className="mt-4" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    )
  }

  const isImage = url.match(/\.(jpg|jpeg|png|gif|webp)$/i)

  if (isImage) {
    return (
      <div className="space-y-4">
        <img src={url} alt="Verification document" className="w-full rounded-md" />
        <div className="flex justify-between items-center">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            Open in new tab
          </a>
          {onClose && (
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="p-4 bg-muted/30 rounded-md text-center">
        <FileText className="h-16 w-16 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">This document format cannot be previewed inline</p>
      </div>
      <div className="flex justify-between items-center">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline"
        >
          Open document in new tab
        </a>
        {onClose && (
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
