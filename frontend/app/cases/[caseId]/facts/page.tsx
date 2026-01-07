'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

interface Fact {
  id: string
  date_time: string | null
  fact: string
  issues: string[]
  evidence: string
  review_status: string
  confidence: number
  source_text: string
  document_id: string
  document_name: string
}

export default function FactsPage() {
  const params = useParams()
  const router = useRouter()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')

  useEffect(() => {
    const initializeMatter = async () => {
      if (!caseIdParam) {
        setLoading(false)
        return
      }

      try {
        let matter
        try {
          matter = await apiClient.getMatter(caseIdParam)
        } catch (error) {
          matter = await apiClient.createMatter(
            caseIdParam,
            `Case ${caseIdParam}`
          )
        }
        setCaseId(matter.id)
      } catch (error) {
        console.error('Error initializing matter:', error)
        setLoading(false)
      }
    }

    initializeMatter()
  }, [caseIdParam])

  useEffect(() => {
    if (caseId) {
      loadFacts()
    }
  }, [caseId, currentPage, reviewStatusFilter])

  const loadFacts = async () => {
    if (!caseId) return

    try {
      setLoading(true)
      const offset = (currentPage - 1) * pageSize
      const response = await apiClient.getMatterFacts(
        caseId,
        pageSize,
        offset,
        reviewStatusFilter !== 'all' ? reviewStatusFilter : undefined
      )
      setFacts(response.facts)
      setTotal(response.total)
    } catch (error) {
      console.error('Error loading facts:', error)
      setFacts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const handleReviewStatusChange = async (factId: string, newStatus: string) => {
    try {
      await apiClient.updateFactReviewStatus(
        factId,
        newStatus as 'accepted' | 'rejected' | 'not_reviewed'
      )
      // Update local state
      setFacts(prevFacts =>
        prevFacts.map(fact =>
          fact.id === factId ? { ...fact, review_status: newStatus } : fact
        )
      )
    } catch (error) {
      console.error('Error updating fact review status:', error)
      alert('Failed to update review status. Please try again.')
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return dateStr
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  // Sort facts by date for timeline view
  const sortedFacts = [...facts].sort((a, b) => {
    if (!a.date_time) return 1
    if (!b.date_time) return -1
    return new Date(b.date_time).getTime() - new Date(a.date_time).getTime()
  })

  // Render Timeline View
  const renderTimelineView = () => {
    if (loading) {
      return <div className="p-12 text-center text-gray-500">Loading facts...</div>
    }

    if (sortedFacts.length === 0) {
      return (
        <div className="p-12 text-center text-gray-500">
          <p>No facts found.</p>
          <p className="text-sm mt-2">Upload and process documents to extract facts.</p>
        </div>
      )
    }

    return (
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-200" />
        
        {/* Timeline items */}
        <div className="space-y-6 pb-8">
          {sortedFacts.map((fact, index) => (
            <div key={fact.id} className="relative pl-20 pr-4">
              {/* Timeline dot */}
              <div className="absolute left-6 top-6 w-4 h-4 rounded-full border-4 border-purple-600 bg-white" />
              
              {/* Fact card */}
              <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                {/* Date/Time Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">
                      {formatDate(fact.date_time)}
                    </div>
                    {fact.date_time && (
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(fact.date_time).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      fact.review_status === 'accepted'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {fact.review_status === 'accepted' ? 'Accepted' : 'Not Reviewed'}
                  </span>
                </div>

                {/* Fact Content */}
                <div className="mb-4">
                  <p className="text-gray-900 leading-relaxed">{fact.fact}</p>
                  {fact.source_text && (
                    <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                      <div className="text-xs font-medium text-gray-500 mb-1">Source Text:</div>
                      <div className="text-sm text-gray-600 italic">
                        "{fact.source_text.substring(0, 200)}..."
                      </div>
                    </div>
                  )}
                </div>

                {/* Issues */}
                {fact.issues.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-medium text-gray-500 mb-2">Related Issues:</div>
                    <div className="flex flex-wrap gap-2">
                      {fact.issues.map((issue, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium"
                        >
                          {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence and Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Evidence:</span> {fact.evidence}
                    </div>
                    <button
                      onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                      className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                    >
                      View Document →
                    </button>
                  </div>
                  <div>
                    {fact.review_status === 'not_reviewed' ? (
                      <button
                        onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium transition-colors"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReviewStatusChange(fact.id, 'not_reviewed')}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium transition-colors"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (loading && !caseId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Facts</h1>
        <p className="text-gray-600">Review and manage all facts extracted from case documents</p>
      </div>

      {/* Filters and View Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Review Status:</label>
          <select
            value={reviewStatusFilter}
            onChange={(e) => {
              setReviewStatusFilter(e.target.value)
              setCurrentPage(1)
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">All</option>
            <option value="accepted">Accepted</option>
            <option value="not_reviewed">Not Reviewed</option>
          </select>
          
          {/* View Mode Toggle */}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-gray-600">View:</span>
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setViewMode('timeline')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  viewMode === 'timeline'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                Timeline
              </button>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            Total: {total} facts
          </div>
        </div>
      </div>

      {/* Facts Display - Timeline or Table View */}
      <div className={viewMode === 'timeline' ? '' : 'bg-white rounded-lg border border-gray-200 overflow-hidden'}>
        {viewMode === 'timeline' ? (
          renderTimelineView()
        ) : loading ? (
          <div className="p-12 text-center text-gray-500">Loading facts...</div>
        ) : facts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No facts found.</p>
            <p className="text-sm mt-2">Upload and process documents to extract facts.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date/Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issues
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Evidence
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Review Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {facts.map((fact) => (
                    <tr key={fact.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(fact.date_time)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                        <div className="line-clamp-2">{fact.fact}</div>
                        {fact.source_text && (
                          <div className="text-xs text-gray-500 mt-1 italic">
                            Source: "{fact.source_text.substring(0, 100)}..."
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {fact.issues.length > 0 ? (
                            fact.issues.map((issue, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                              >
                                {issue}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">None</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={fact.evidence}>
                          {fact.evidence}
                        </div>
                        <button
                          onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                          className="text-xs text-purple-600 hover:text-purple-700 mt-1"
                        >
                          View document
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            fact.review_status === 'accepted'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {fact.review_status === 'accepted' ? 'Accepted' : 'Not Reviewed'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {fact.review_status === 'not_reviewed' ? (
                          <button
                            onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                            className="text-purple-600 hover:text-purple-700 font-medium mr-3"
                          >
                            Accept
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReviewStatusChange(fact.id, 'not_reviewed')}
                            className="text-gray-600 hover:text-gray-700"
                          >
                            Undo
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination - Only show in list view */}
            {viewMode === 'list' && totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} facts
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
                          className={`px-3 py-2 border rounded-lg text-sm font-medium ${
                            currentPage === pageNum
                              ? 'bg-purple-600 text-white border-purple-600'
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

