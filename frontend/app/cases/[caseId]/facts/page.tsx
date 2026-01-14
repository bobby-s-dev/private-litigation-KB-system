'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, X, Filter } from 'lucide-react'
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
  const [searchQuery, setSearchQuery] = useState<string>('')
  const timelineScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)

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
      setCurrentPage(1) // Reset to first page when filtering by entity
    }
  }, [searchParams])

  useEffect(() => {
    if (caseId) {
      loadFacts()
    }
  }, [caseId, currentPage, reviewStatusFilter, entityFilter, searchQuery])

  const loadFacts = async () => {
    if (!caseId) return

    try {
      setLoading(true)
      const offset = (currentPage - 1) * pageSize
      const response = await apiClient.getMatterFacts(
        caseId,
        pageSize,
        offset,
        reviewStatusFilter !== 'all' ? reviewStatusFilter : undefined,
        entityFilter || undefined,
        searchQuery || undefined
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

  const totalPages = Math.ceil(total / pageSize)

  // Sort facts by date for timeline view
  const sortedFacts = [...facts].sort((a, b) => {
    if (!a.date_time) return 1
    if (!b.date_time) return -1
    return new Date(b.date_time).getTime() - new Date(a.date_time).getTime()
  })

  // Clear entity filter
  const clearEntityFilter = () => {
    setEntityFilter('')
    router.push(`/cases/${caseIdParam}/facts`)
  }

  // Timeline scroll handlers
  const checkScrollButtons = useCallback(() => {
    if (!timelineScrollRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = timelineScrollRef.current
    setCanScrollLeft(scrollLeft > 0)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  const scrollTimeline = (direction: 'left' | 'right') => {
    if (!timelineScrollRef.current) return
    const scrollAmount = timelineScrollRef.current.clientWidth * 0.8
    const newScrollLeft = direction === 'left' 
      ? timelineScrollRef.current.scrollLeft - scrollAmount
      : timelineScrollRef.current.scrollLeft + scrollAmount
    timelineScrollRef.current.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    })
  }

  // Check scroll buttons when timeline is rendered or view mode changes
  useEffect(() => {
    if (viewMode === 'timeline') {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => {
        checkScrollButtons()
      }, 100)
      
      // Also check on window resize
      const handleResize = () => {
        checkScrollButtons()
      }
      window.addEventListener('resize', handleResize)
      
      return () => {
        clearTimeout(timer)
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [viewMode, facts, checkScrollButtons])

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
      return <div className="p-8 sm:p-12 text-center text-gray-500 text-sm sm:text-base">Loading facts...</div>
    }

    if (sortedFacts.length === 0) {
      return (
        <div className="p-8 sm:p-12 text-center text-gray-500">
          {entityFilter || searchQuery ? (
            <>
              <p className="text-sm sm:text-base">
                No facts found
                {entityFilter && searchQuery
                  ? ` for entity "${entityFilter}" and search "${searchQuery}"`
                  : entityFilter
                  ? ` for entity "${entityFilter}"`
                  : ` for search "${searchQuery}"`}
                .
              </p>
              <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                {entityFilter && (
                  <button
                    onClick={clearEntityFilter}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs sm:text-sm font-medium"
                  >
                    Clear Entity Filter
                  </button>
                )}
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('')
                      setCurrentPage(1)
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs sm:text-sm font-medium"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm sm:text-base">No facts found.</p>
              <p className="text-xs sm:text-sm mt-2">Upload and process documents to extract facts.</p>
            </>
          )}
        </div>
      )
    }

    const groupedFacts = groupFactsByDate()
    const dates = Object.keys(groupedFacts).filter(d => d !== 'No Date')
    const noDateFacts = groupedFacts['No Date'] || []

    return (
      <div className="bg-gradient-to-b from-purple-50 to-white rounded-lg p-3 sm:p-4 md:p-6 w-full overflow-hidden relative" style={{ overflowX: 'scroll', overflowY: 'visible', maxWidth: '90vw' }}>
        {/* Scroll Navigation Buttons - Fixed at middle of screen */}
        {canScrollLeft && (
          <button
            onClick={() => scrollTimeline('left')}
            className="fixed left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 bg-white/90 hover:bg-white border-2 border-purple-300 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
          </button>
        )}
        {canScrollRight && (
          <button
            onClick={() => scrollTimeline('right')}
            className="fixed right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 bg-white/90 hover:bg-white border-2 border-purple-300 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
          </button>
        )}
        
        {/* Horizontal Timeline - Constrained Scrollable Container */}
        <div 
          ref={timelineScrollRef}
          onScroll={checkScrollButtons}
          className="w-full overflow-x-auto overflow-y-visible pb-6 sm:pb-8 scrollbar-thin scrollbar-thumb-purple-400 scrollbar-track-gray-100" 
          style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: '#c084fc #f3f4f6'
          }}
        >
          <div className="min-w-max">
            {/* Timeline axis */}
            <div className="relative mb-4 sm:mb-6 md:mb-8">
              {/* Horizontal line */}
              <div className="absolute top-5 sm:top-6 left-0 right-0 h-0.5 sm:h-1 bg-gradient-to-r from-purple-300 via-purple-500 to-purple-300" />
              
              {/* Date markers */}
              <div className="flex justify-between items-start relative gap-2 sm:gap-0">
                {dates.map((date, index) => (
                  <div key={date} className="flex flex-col items-center min-w-[120px] sm:min-w-[150px] md:min-w-[200px] flex-shrink-0">
                    {/* Marker */}
                    <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 rounded-full bg-purple-600 border-2 sm:border-3 md:border-4 border-white shadow-lg z-10 mb-1.5 sm:mb-2" />
                    {/* Date label */}
                    <div className="text-[10px] sm:text-xs md:text-sm font-semibold text-purple-900 mb-0.5 sm:mb-1 text-center px-1 break-words">{date}</div>
                    <div className="text-[9px] sm:text-xs text-gray-500 text-center">
                      {groupedFacts[date].length} {groupedFacts[date].length === 1 ? 'fact' : 'facts'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Facts grouped by date */}
            <div className="flex gap-2 sm:gap-3 md:gap-6">
              {dates.map((date, dateIndex) => (
                <div key={date} className="min-w-[120px] sm:min-w-[180px] md:min-w-[220px] max-w-[140px] sm:max-w-[240px] md:max-w-[300px] flex-shrink-0">
                  <div className="space-y-2 sm:space-y-3 md:space-y-4">
                    {groupedFacts[date].map((fact, factIndex) => (
                      <div
                        key={fact.id}
                        className="relative"
                      >
                        {/* Connecting line from timeline */}
                        {factIndex === 0 && (
                          <div className="absolute -top-6 sm:-top-8 left-1/2 w-0.5 h-6 sm:h-8 bg-purple-300" />
                        )}
                        
                        {/* Fact card */}
                        <div className="bg-white border-2 border-purple-200 rounded-lg p-2 sm:p-3 md:p-4 hover:shadow-lg hover:border-purple-400 transition-all">
                          {/* Time */}
                          {fact.date_time && (
                            <div className="text-[10px] sm:text-xs font-medium text-purple-600 mb-1.5 sm:mb-2">
                              {new Date(fact.date_time).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                          )}
                          
                          {/* Status badge */}
                          <div className="flex justify-between items-start mb-1.5 sm:mb-2">
                            <span
                              className={`px-1.5 sm:px-2 py-0.5 rounded text-[10px] sm:text-xs font-medium ${
                                fact.review_status === 'accepted'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {fact.review_status === 'accepted' ? '✓ Accepted' : '○ Review'}
                            </span>
                          </div>

                          {/* Fact text */}
                          <p className="text-[10px] sm:text-xs md:text-sm text-gray-900 mb-1.5 sm:mb-2 md:mb-3 line-clamp-2 sm:line-clamp-3 md:line-clamp-4 break-words" title={fact.fact}>
                            {highlightEntity(fact.fact)}
                          </p>

                          {/* Issues */}
                          {fact.issues.length > 0 && (
                            <div className="mb-1.5 sm:mb-2 md:mb-3">
                              <div className="flex flex-wrap gap-0.5 sm:gap-1">
                                {fact.issues.slice(0, 2).map((issue, idx) => (
                                  <span
                                    key={idx}
                                    className="px-1.5 sm:px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[9px] sm:text-xs"
                                  >
                                    {issue}
                                  </span>
                                ))}
                                {fact.issues.length > 2 && (
                                  <span className="text-[9px] sm:text-xs text-gray-500">
                                    +{fact.issues.length - 2} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex flex-col gap-1.5 sm:gap-2 pt-2 sm:pt-3 border-t border-gray-100">
                            <button
                              onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                              className="text-[10px] sm:text-xs text-purple-600 hover:text-purple-700 font-medium text-left truncate"
                            >
                              📄 View Document
                            </button>
                            {fact.review_status === 'not_reviewed' ? (
                              <button
                                onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                                className="w-full px-2 sm:px-3 py-1 sm:py-1.5 bg-purple-600 text-white rounded hover:bg-purple-700 text-[10px] sm:text-xs font-medium"
                              >
                                Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReviewStatusChange(fact.id, 'not_reviewed')}
                                className="w-full px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-[10px] sm:text-xs font-medium"
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
          <div className="mt-6 sm:mt-8 pt-6 sm:pt-8 border-t-2 border-gray-200">
            <h3 className="text-base sm:text-lg font-semibold text-gray-700 mb-3 sm:mb-4">Facts Without Dates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {noDateFacts.map((fact) => (
                <div
                  key={fact.id}
                  className="bg-white border border-gray-300 rounded-lg p-3 sm:p-4 hover:shadow-md transition-shadow"
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
    <div className="p-3 sm:p-4 md:p-6 max-w-full overflow-x-hidden w-full">
      {/* Header */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">Facts</h1>
        <p className="text-sm sm:text-base text-gray-600">Review and manage all facts extracted from case documents</p>
      </div>

      {/* Active Entity Filter Indicator */}
      {entityFilter && (
        <div className="bg-purple-50 border-l-4 border-purple-500 p-3 sm:p-4 mb-4 sm:mb-6 rounded-r-lg overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 w-full sm:w-auto">
              <div className="flex-shrink-0">
                <Filter className="h-5 w-5 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-xs sm:text-sm font-medium text-purple-900 truncate">
                  Filtering by entity: <span className="font-bold">"{entityFilter}"</span>
                </p>
                <p className="text-xs text-purple-700 mt-0.5 truncate">
                  Showing {total} facts
                </p>
              </div>
            </div>
            <button
              onClick={clearEntityFilter}
              className="flex-shrink-0 w-full sm:w-auto px-3 sm:px-4 py-2 bg-purple-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors whitespace-nowrap"
            >
              Clear Filter
            </button>
          </div>
        </div>
      )}

      {/* Filters and View Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4 mb-4 sm:mb-6 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 lg:gap-4 min-w-0">
          {/* Search Box */}
          <div className="flex-1 w-full min-w-0 lg:min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search facts..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setCurrentPage(1)
                }}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setCurrentPage(1)
                  }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
          
          {/* Controls Row */}
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
              <label className="text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap flex-shrink-0">Status:</label>
              <select
                value={reviewStatusFilter}
                onChange={(e) => {
                  setReviewStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-2 sm:px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs sm:text-sm min-w-[100px] sm:min-w-[120px]"
              >
                <option value="all">All</option>
                <option value="accepted">Accepted</option>
                <option value="not_reviewed">Not Reviewed</option>
              </select>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <span className="text-xs sm:text-sm text-gray-600 hidden md:inline flex-shrink-0">View:</span>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2.5 sm:px-3 md:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('timeline')}
                  className={`px-2.5 sm:px-3 md:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
                    viewMode === 'timeline'
                      ? 'bg-purple-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Timeline
                </button>
              </div>
            </div>
            
            {/* Total Count */}
            <div className="text-xs sm:text-sm text-gray-600 flex-shrink-0 ml-auto lg:ml-0">
              {entityFilter ? (
                <>Showing: {total} facts</>
              ) : (
                <>Total: {total} facts</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Facts Display - Timeline or Table View */}
      <div className={viewMode === 'timeline' ? 'w-full max-w-full overflow-hidden relative' : 'bg-white rounded-lg border border-gray-200 overflow-x-auto'}>
        {viewMode === 'timeline' ? (
          <div className="w-full overflow-hidden">
            {renderTimelineView()}
          </div>
        ) : loading ? (
          <div className="p-8 sm:p-12 text-center text-gray-500 text-sm sm:text-base">Loading facts...</div>
        ) : facts.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-gray-500">
            {entityFilter || searchQuery ? (
              <>
                <p className="text-sm sm:text-base">
                  No facts found
                  {entityFilter && searchQuery
                    ? ` for entity "${entityFilter}" and search "${searchQuery}"`
                    : entityFilter
                    ? ` for entity "${entityFilter}"`
                    : ` for search "${searchQuery}"`}
                  .
                </p>
                <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
                  {entityFilter && (
                    <button
                      onClick={clearEntityFilter}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs sm:text-sm font-medium"
                    >
                      Clear Entity Filter
                    </button>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('')
                        setCurrentPage(1)
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs sm:text-sm font-medium"
                    >
                      Clear Search
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm sm:text-base">No facts found.</p>
                <p className="text-xs sm:text-sm mt-2">Upload and process documents to extract facts.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date/Time
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fact
                    </th>
                    <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issues
                    </th>
                    <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Evidence
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {facts.map((fact) => (
                    <tr key={fact.id} className="hover:bg-gray-50">
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-gray-900">
                        {formatDate(fact.date_time)}
                      </td>
                      <td className="px-3 sm:px-6 py-4 text-xs sm:text-sm text-gray-900 max-w-xs sm:max-w-md">
                        <div className="line-clamp-2">{highlightEntity(fact.fact)}</div>
                        {fact.source_text && (
                          <div className="text-xs text-gray-500 mt-1 italic hidden sm:block">
                            Source: "{fact.source_text.substring(0, 100)}..."
                          </div>
                        )}
                        {/* Show issues on mobile if hidden in table */}
                        <div className="md:hidden mt-2">
                          <div className="flex flex-wrap gap-1">
                            {fact.issues.length > 0 ? (
                              fact.issues.slice(0, 2).map((issue, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium"
                                >
                                  {issue}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-gray-400">No issues</span>
                            )}
                            {fact.issues.length > 2 && (
                              <span className="text-xs text-gray-500">+{fact.issues.length - 2} more</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="hidden md:table-cell px-6 py-4 whitespace-nowrap">
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
                      <td className="hidden lg:table-cell px-6 py-4 text-sm text-gray-900">
                        <div className="max-w-xs truncate" title={fact.evidence}>
                          {fact.evidence}
                        </div>
                        <button
                          onClick={() => router.push(`/cases/${caseIdParam}/documents/${fact.document_id}/review`)}
                          className="text-xs text-purple-600 hover:text-purple-700 mt-1"
                        >
                          Review document
                        </button>
                      </td>
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
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
                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm">
                        {fact.review_status === 'not_reviewed' ? (
                          <button
                            onClick={() => handleReviewStatusChange(fact.id, 'accepted')}
                            className="text-purple-600 hover:text-purple-700 font-medium"
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
              <div className="bg-gray-50 px-3 sm:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} facts
                </div>
                <div className="flex items-center gap-1 sm:gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
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
                          className={`px-2 sm:px-3 py-2 border rounded-lg text-xs sm:text-sm font-medium ${
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
                    className="px-2 sm:px-3 py-2 border border-gray-300 rounded-lg text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

