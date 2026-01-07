'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [facts, setFacts] = useState<Fact[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(20)
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list')
  const [entityFilter, setEntityFilter] = useState<string>('')

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

  // Read entity filter from URL query parameters
  useEffect(() => {
    const entityParam = searchParams?.get('entity')
    if (entityParam) {
      setEntityFilter(entityParam)
    }
  }, [searchParams])

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

  // Highlight entity in text
  const highlightEntity = (text: string) => {
    if (!entityFilter || !text) return text
    
    const regex = new RegExp(`(${entityFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 font-semibold">{part}</span>
      ) : (
        part
      )
    )
  }

  // Filter facts by entity if entity filter is active
  const filteredFacts = entityFilter 
    ? facts.filter(fact => 
        fact.fact.toLowerCase().includes(entityFilter.toLowerCase()) ||
        fact.evidence.toLowerCase().includes(entityFilter.toLowerCase()) ||
        fact.source_text.toLowerCase().includes(entityFilter.toLowerCase())
      )
    : facts

  const totalPages = Math.ceil(total / pageSize)

  // Sort facts by date for timeline view
  const sortedFacts = [...filteredFacts].sort((a, b) => {
    if (!a.date_time) return 1
    if (!b.date_time) return -1
    return new Date(b.date_time).getTime() - new Date(a.date_time).getTime()
  })

  // Clear entity filter
  const clearEntityFilter = () => {
    setEntityFilter('')
    router.push(`/cases/${caseIdParam}/facts`)
  }

  // Group facts by date for timeline
  const groupFactsByDate = () => {
    const grouped: { [key: string]: Fact[] } = {}
    
    sortedFacts.forEach(fact => {
      if (fact.date_time) {
        const date = new Date(fact.date_time).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        })
        if (!grouped[date]) {
          grouped[date] = []
        }
        grouped[date].push(fact)
      } else {
        if (!grouped['No Date']) {
          grouped['No Date'] = []
        }
        grouped['No Date'].push(fact)
      }
    })
    
    return grouped
  }

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

    const groupedFacts = groupFactsByDate()
    const dates = Object.keys(groupedFacts).filter(d => d !== 'No Date')
    const noDateFacts = groupedFacts['No Date'] || []

    return (
      <div className="bg-gradient-to-b from-purple-50 to-white rounded-lg p-6">
        {/* Horizontal Timeline */}
        <div className="overflow-x-auto pb-8">
          <div className="min-w-max">
            {/* Timeline axis */}
            <div className="relative mb-8">
              {/* Horizontal line */}
              <div className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-purple-300 via-purple-500 to-purple-300" />
              
              {/* Date markers */}
              <div className="flex justify-between items-start relative">
                {dates.map((date, index) => (
                  <div key={date} className="flex flex-col items-center min-w-[200px]">
                    {/* Marker */}
                    <div className="w-4 h-4 rounded-full bg-purple-600 border-4 border-white shadow-lg z-10 mb-2" />
                    {/* Date label */}
                    <div className="text-sm font-semibold text-purple-900 mb-1">{date}</div>
                    <div className="text-xs text-gray-500">
                      {groupedFacts[date].length} {groupedFacts[date].length === 1 ? 'fact' : 'facts'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facts grouped by date */}
            <div className="flex gap-6">
              {dates.map((date, dateIndex) => (
                <div key={date} className="min-w-[200px] max-w-[300px] flex-shrink-0">
                  <div className="space-y-4">
                    {groupedFacts[date].map((fact, factIndex) => (
                      <div
                        key={fact.id}
                        className="relative"
                      >
                        {/* Connecting line from timeline */}
                        {factIndex === 0 && (
                          <div className="absolute -top-8 left-1/2 w-0.5 h-8 bg-purple-300" />
                        )}
                        
                        {/* Fact card */}
                        <div className="bg-white border-2 border-purple-200 rounded-lg p-4 hover:shadow-lg hover:border-purple-400 transition-all">
                          {/* Time */}
                          {fact.date_time && (
                            <div className="text-xs font-medium text-purple-600 mb-2">
                              {new Date(fact.date_time).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                          
                          {/* Status badge */}
                          <div className="flex justify-between items-start mb-2">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                fact.review_status === 'accepted'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {fact.review_status === 'accepted' ? '✓ Accepted' : '○ Review'}
                            </span>
                          </div>

                          {/* Fact text */}
                          <p className="text-sm text-gray-900 mb-3 line-clamp-4" title={fact.fact}>
                            {highlightEntity(fact.fact)}
                          </p>

                          {/* Issues */}
                          {fact.issues.length > 0 && (
                            <div className="mb-3">
                              <div className="flex flex-wrap gap-1">
                                {fact.issues.slice(0, 2).map((issue, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                                  >
                                    {issue}
                                  </span>
                                ))}
                                {fact.issues.length > 2 && (
                                  <span className="text-xs text-gray-500">
                                    +{fact.issues.length - 2} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                              className="text-xs text-purple-600 hover:text-purple-700 font-medium text-left"
                            >
                              📄 View Document
                            </button>
                            {fact.review_status === 'not_reviewed' ? (
                              <button
                                onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                                className="w-full px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs font-medium"
                              >
                                Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReviewStatusChange(fact.id, 'not_reviewed')}
                                className="w-full px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs font-medium"
                              >
                                Undo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Facts without dates */}
        {noDateFacts.length > 0 && (
          <div className="mt-8 pt-8 border-t-2 border-gray-200">
            <h3 className="text-lg font-semibold text-gray-700 mb-4">Facts Without Dates</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {noDateFacts.map((fact) => (
                <div
                  key={fact.id}
                  className="bg-white border border-gray-300 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {/* Status badge */}
                  <div className="flex justify-between items-start mb-2">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        fact.review_status === 'accepted'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {fact.review_status === 'accepted' ? '✓ Accepted' : '○ Review'}
                    </span>
                  </div>

                  {/* Fact text */}
                  <p className="text-sm text-gray-900 mb-3">{highlightEntity(fact.fact)}</p>

                  {/* Issues */}
                  {fact.issues.length > 0 && (
                    <div className="mb-3">
                      <div className="flex flex-wrap gap-1">
                        {fact.issues.slice(0, 2).map((issue, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                          >
                            {issue}
                          </span>
                        ))}
                        {fact.issues.length > 2 && (
                          <span className="text-xs text-gray-500">
                            +{fact.issues.length - 2} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
                    <button
                      onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                      className="text-xs text-purple-600 hover:text-purple-700 font-medium text-left"
                    >
                      📄 View Document
                    </button>
                    {fact.review_status === 'not_reviewed' ? (
                      <button
                        onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                        className="w-full px-3 py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 text-xs font-medium"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => handleReviewStatusChange(fact.id, 'not_reviewed')}
                        className="w-full px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs font-medium"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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

      {/* Active Entity Filter Indicator */}
      {entityFilter && (
        <div className="bg-purple-50 border-l-4 border-purple-500 p-4 mb-6 rounded-r-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-purple-900">
                  Filtering by entity: <span className="font-bold">"{entityFilter}"</span>
                </p>
                <p className="text-xs text-purple-700 mt-0.5">
                  Showing {filteredFacts.length} of {facts.length} facts
                </p>
              </div>
            </div>
            <button
              onClick={clearEntityFilter}
              className="flex-shrink-0 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            >
              Clear Filter
            </button>
          </div>
        </div>
      )}

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
            {entityFilter ? (
              <>Showing: {filteredFacts.length} facts</>
            ) : (
              <>Total: {total} facts</>
            )}
          </div>
        </div>
      </div>

      {/* Facts Display - Timeline or Table View */}
      <div className={viewMode === 'timeline' ? '' : 'bg-white rounded-lg border border-gray-200 overflow-hidden'}>
        {viewMode === 'timeline' ? (
          renderTimelineView()
        ) : loading ? (
          <div className="p-12 text-center text-gray-500">Loading facts...</div>
        ) : filteredFacts.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {entityFilter ? (
              <>
                <p>No facts found for entity "{entityFilter}".</p>
                <button
                  onClick={clearEntityFilter}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  Clear Filter
                </button>
              </>
            ) : (
              <>
                <p>No facts found.</p>
                <p className="text-sm mt-2">Upload and process documents to extract facts.</p>
              </>
            )}
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
                  {filteredFacts.map((fact) => (
                    <tr key={fact.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(fact.date_time)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-md">
                        <div className="line-clamp-2">{highlightEntity(fact.fact)}</div>
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

            {/* Pagination - Only show in list view and when not filtering by entity */}
            {viewMode === 'list' && !entityFilter && totalPages > 1 && (
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

