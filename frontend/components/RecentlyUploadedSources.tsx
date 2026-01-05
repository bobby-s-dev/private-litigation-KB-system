'use client'

import { useEffect, useState } from 'react'
import { apiClient, Document } from '@/lib/api'

interface Source {
  name: string
  citations: number
  uploaded: string
  relatedFacts?: number
  id: string
}

interface RecentlyUploadedSourcesProps {
  matterId?: string
  refreshKey?: number
}

export default function RecentlyUploadedSources({ matterId, refreshKey }: RecentlyUploadedSourcesProps) {
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!matterId) {
      setLoading(false)
      return
    }

    const fetchDocuments = async () => {
      try {
        setLoading(true)
        const documents = await apiClient.getDocumentsByMatter(matterId)
        
        const formattedSources: Source[] = documents.map((doc: Document) => {
          const uploadDate = doc.ingested_at || doc.created_at
          let formattedDate = 'Unknown'
          
          if (uploadDate) {
            try {
              const date = new Date(uploadDate)
              formattedDate = date.toLocaleString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              })
            } catch (e) {
              formattedDate = uploadDate
            }
          }
          
          return {
            id: doc.id,
            name: doc.file_name || doc.filename,
            citations: doc.citations || 0,
            uploaded: formattedDate,
            relatedFacts: doc.citations || 0,
          }
        })
        
        // Sort by upload date (most recent first)
        formattedSources.sort((a, b) => {
          const dateA = documents.find(d => d.id === a.id)?.ingested_at || documents.find(d => d.id === a.id)?.created_at
          const dateB = documents.find(d => d.id === b.id)?.ingested_at || documents.find(d => d.id === b.id)?.created_at
          if (!dateA || !dateB) return 0
          return new Date(dateB).getTime() - new Date(dateA).getTime()
        })
        
        setSources(formattedSources)
      } catch (error) {
        console.error('Error fetching documents:', error)
        setSources([])
      } finally {
        setLoading(false)
      }
    }

    fetchDocuments()
  }, [matterId, refreshKey])

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      </div>
    )
  }

  if (sources.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recently uploaded sources</h2>
        </div>
        <p className="text-gray-600 text-sm py-4">No documents uploaded yet.</p>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recently uploaded sources</h2>
        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
          View all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Number of Citations</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Uploaded</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">{source.name}</div>
                  {source.relatedFacts && (
                    <button className="text-sm text-purple-600 hover:text-purple-700 mt-1">
                      View {source.relatedFacts} related fact{source.relatedFacts !== 1 ? 's' : ''}
                    </button>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-700">{source.citations}</td>
                <td className="py-3 px-4 text-gray-600 text-sm">{source.uploaded}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <button className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors">
                      Launch Reviewer
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      ✏️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

