'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient, Document } from '@/lib/api'

interface Source {
  name: string
  citations: number
  uploaded: string
  relatedFacts?: number
  factsCount?: number
  entitiesCount?: number
  id: string
}

interface RecentlyUploadedSourcesProps {
  matterId?: string
  refreshKey?: number
}

export default function RecentlyUploadedSources({ matterId, refreshKey }: RecentlyUploadedSourcesProps) {
  const router = useRouter()
  const params = useParams()
  const caseId = params?.caseId as string
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)

  const handleReview = (documentId: string) => {
    if (caseId) {
      router.push(`/cases/${caseId}/documents/${documentId}/review`)
    }
  }

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
            relatedFacts: doc.facts_count || doc.citations || 0,
            factsCount: doc.facts_count || 0,
            entitiesCount: doc.entities_count || 0,
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
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Facts</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Entities</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Uploaded</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">{source.name}</div>
                </td>
                <td className="py-3 px-4">
                  {source.factsCount !== undefined ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        source.factsCount > 0 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {source.factsCount} fact{source.factsCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {source.entitiesCount !== undefined ? (
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        source.entitiesCount > 0 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {source.entitiesCount} entit{source.entitiesCount !== 1 ? 'ies' : 'y'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">-</span>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-600 text-sm">{source.uploaded}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReview(source.id)}
                      className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors"
                    >
                      Review
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

