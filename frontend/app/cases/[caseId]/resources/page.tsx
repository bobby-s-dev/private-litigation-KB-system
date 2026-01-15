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

export default function ResourcesPage() {
  const router = useRouter()
  const params = useParams()
  const caseId = params?.caseId as string
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(20)

  useEffect(() => {
    if (!caseId) {
      setLoading(false)
      return
    }

    const fetchDocuments = async () => {
      try {
        setLoading(true)
        const documents = await apiClient.getDocumentsByMatter(caseId)

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

        setTotalCount(formattedSources.length)
        const startIndex = (currentPage - 1) * itemsPerPage
        const endIndex = startIndex + itemsPerPage
        setSources(formattedSources.slice(startIndex, endIndex))
      } catch (error) {
        console.error('Error fetching documents:', error)
        setSources([])
      } finally {
        setLoading(false)
      }
    }

    fetchDocuments()
  }, [caseId, currentPage])

  const handleReview = (documentId: string) => {
    if (caseId) {
      router.push(`/cases/${caseId}/documents/${documentId}/review`)
    }
  }

  const handleView = (documentId: string) => {
    const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const fileUrl = `${API_BASE_URL}/api/documents/${documentId}/file`
    
    // Open the file in a new tab/window
    // The browser will handle the file type appropriately:
    // - PDFs will open in the browser's PDF viewer
    // - Images will display inline
    // - Other files will download or open based on browser settings
    window.open(fileUrl, '_blank')
  }

  const totalPages = Math.ceil(totalCount / itemsPerPage)

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Resources</h1>
          <div className="text-sm text-gray-600">
            Showing {sources.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} - {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount}
          </div>
        </div>

        {sources.length === 0 ? (
          <p className="text-gray-600 text-sm py-8 text-center">No documents uploaded yet.</p>
        ) : (
          <>
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
                            <span className={`px-2 py-1 rounded text-xs font-medium ${source.factsCount > 0
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
                            <span className={`px-2 py-1 rounded text-xs font-medium ${source.entitiesCount > 0
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
                            className="bg-primary-600 text-white px-3 py-1 rounded text-sm hover:bg-primary-700 transition-colors"
                          >
                            Review
                          </button>
                          <button className="text-gray-400 hover:text-gray-600" onClick={() => handleView(source.id)}>
                            👁‍🗨
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} resources
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Rows per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 border rounded-lg text-sm font-medium ${currentPage === pageNum
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

