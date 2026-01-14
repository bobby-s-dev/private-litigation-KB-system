'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar, Clock, User, FileText, Activity as ActivityIcon } from 'lucide-react'
import { apiClient, Matter } from '@/lib/api'

interface Activity {
  id: string
  action_type: string
  resource_type: string
  resource_id: string
  matter_id: string | null
  description: string
  username: string | null
  created_at: string
  metadata: any
}

interface CaseActivities {
  case: Matter
  activities: Activity[]
  groupedByDate: Record<string, Activity[]>
  loading: boolean
}

export default function ActivitiesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Matter[]>([])
  const [casesWithActivities, setCasesWithActivities] = useState<Map<string, CaseActivities>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [caseFilter, setCaseFilter] = useState<string>('all')
  const timelineScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const [canScrollLeft, setCanScrollLeft] = useState<Map<string, boolean>>(new Map())
  const [canScrollRight, setCanScrollRight] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    loadCases()
  }, [])

  useEffect(() => {
    // Load activities for expanded cases
    expandedCases.forEach(caseId => {
      if (!casesWithActivities.has(caseId)) {
        loadActivitiesForCase(caseId)
      }
    })
  }, [expandedCases, cases])

  const loadCases = async () => {
    try {
      setLoading(true)
      const matters = await apiClient.listMatters()
      setCases(matters)
      // Auto-expand first case if available
      if (matters.length > 0) {
        setExpandedCases(new Set([matters[0].id]))
      }
    } catch (error) {
      console.error('Error loading cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadActivitiesForCase = async (caseId: string) => {
    const caseData = cases.find(c => c.id === caseId)
    if (!caseData) return

    try {
      // Set loading state
      setCasesWithActivities(prev => {
        const updated = new Map(prev)
        updated.set(caseId, {
          case: caseData,
          activities: [],
          groupedByDate: {},
          loading: true
        })
        return updated
      })

      // Fetch all activities (using a large limit to get all)
      const response = await apiClient.getMatterActivities(caseId, 1000, 0)
      const activities = response?.activities || []

      // Group activities by date
      const groupedByDate = groupActivitiesByDate(activities)

      setCasesWithActivities(prev => {
        const updated = new Map(prev)
        updated.set(caseId, {
          case: caseData,
          activities,
          groupedByDate,
          loading: false
        })
        return updated
      })

      // Initialize scroll state
      setTimeout(() => {
        checkScrollButtons(caseId)
      }, 100)
    } catch (error) {
      console.error(`Error loading activities for case ${caseId}:`, error)
      setCasesWithActivities(prev => {
        const updated = new Map(prev)
        updated.set(caseId, {
          case: caseData,
          activities: [],
          groupedByDate: {},
          loading: false
        })
        return updated
      })
    }
  }

  const groupActivitiesByDate = (activities: Activity[]): Record<string, Activity[]> => {
    const grouped: Record<string, Activity[]> = {}
    
    activities.forEach(activity => {
      const date = new Date(activity.created_at)
      const dateKey = formatDateKey(date)
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = []
      }
      grouped[dateKey].push(activity)
    })

    // Sort activities within each date group by time (newest first)
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    })

    return grouped
  }

  const formatDateKey = (date: Date): string => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatTime = (isoString: string): string => {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatActivityTime = (isoString: string): string => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) {
      return 'Just now'
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    } else {
      const dateStr = date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      })
      const timeStr = date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
      return `${dateStr} at ${timeStr}`
    }
  }

  const toggleCaseExpansion = (caseId: string) => {
    setExpandedCases(prev => {
      const updated = new Set(prev)
      if (updated.has(caseId)) {
        updated.delete(caseId)
      } else {
        updated.add(caseId)
      }
      return updated
    })
  }

  const checkScrollButtons = useCallback((caseId: string) => {
    const scrollContainer = timelineScrollRefs.current.get(caseId)
    if (!scrollContainer) return

    const { scrollLeft, scrollWidth, clientWidth } = scrollContainer
    setCanScrollLeft(prev => {
      const updated = new Map(prev)
      updated.set(caseId, scrollLeft > 0)
      return updated
    })
    setCanScrollRight(prev => {
      const updated = new Map(prev)
      updated.set(caseId, scrollLeft < scrollWidth - clientWidth - 10)
      return updated
    })
  }, [])

  const scrollTimeline = (caseId: string, direction: 'left' | 'right') => {
    const scrollContainer = timelineScrollRefs.current.get(caseId)
    if (!scrollContainer) return

    const scrollAmount = 300
    const newScrollLeft = direction === 'left' 
      ? scrollContainer.scrollLeft - scrollAmount
      : scrollContainer.scrollLeft + scrollAmount

    scrollContainer.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    })

    setTimeout(() => checkScrollButtons(caseId), 100)
  }

  const getActionTypeColor = (actionType: string): string => {
    const colors: Record<string, string> = {
      'create': 'bg-green-100 text-green-800 border-green-300',
      'update': 'bg-blue-100 text-blue-800 border-blue-300',
      'delete': 'bg-red-100 text-red-800 border-red-300',
      'upload': 'bg-purple-100 text-purple-800 border-purple-300',
      'process': 'bg-yellow-100 text-yellow-800 border-yellow-300',
      'review': 'bg-indigo-100 text-indigo-800 border-indigo-300',
    }
    return colors[actionType.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-300'
  }

  const getResourceTypeIcon = (resourceType: string) => {
    switch (resourceType.toLowerCase()) {
      case 'document':
        return <FileText className="w-4 h-4" />
      case 'matter':
        return <ActivityIcon className="w-4 h-4" />
      default:
        return <ActivityIcon className="w-4 h-4" />
    }
  }

  // Filter cases based on search and case filter
  const filteredCases = cases.filter(caseItem => {
    const matchesSearch = !searchQuery || 
      caseItem.matter_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      caseItem.matter_number.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCaseFilter = caseFilter === 'all' || caseItem.id === caseFilter
    return matchesSearch && matchesCaseFilter
  })

  // Filter activities based on search
  const getFilteredActivities = (caseActivities: CaseActivities): Record<string, Activity[]> => {
    if (!searchQuery) return caseActivities.groupedByDate

    const filtered: Record<string, Activity[]> = {}
    Object.keys(caseActivities.groupedByDate).forEach(dateKey => {
      const activities = caseActivities.groupedByDate[dateKey].filter(activity =>
        activity.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        activity.resource_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (activity.username && activity.username.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      if (activities.length > 0) {
        filtered[dateKey] = activities
      }
    })
    return filtered
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Activities</h1>
        <p className="text-gray-600">View activities across all cases, organized by timeline</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search activities by description, action type, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="sm:w-64">
            <select
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="all">All Cases</option>
              {cases.map(caseItem => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.matter_name} ({caseItem.matter_number})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cases List */}
      {filteredCases.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-600">No cases found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredCases.map(caseItem => {
            const caseActivities = casesWithActivities.get(caseItem.id)
            const isExpanded = expandedCases.has(caseItem.id)
            const filteredGrouped = caseActivities ? getFilteredActivities(caseActivities) : {}
            const dates = Object.keys(filteredGrouped).sort((a, b) => {
              // Sort dates chronologically (newest first)
              // Get the first activity's timestamp from each date group for accurate sorting
              const dateA = filteredGrouped[a]?.[0]?.created_at
              const dateB = filteredGrouped[b]?.[0]?.created_at
              if (!dateA || !dateB) return 0
              return new Date(dateB).getTime() - new Date(dateA).getTime()
            })

            return (
              <div key={caseItem.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Case Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleCaseExpansion(caseItem.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900">{caseItem.matter_name}</h2>
                      <p className="text-sm text-gray-600">Case #{caseItem.matter_number}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {caseActivities && (
                        <div className="text-sm text-gray-600">
                          {caseActivities.activities.length} {caseActivities.activities.length === 1 ? 'activity' : 'activities'}
                        </div>
                      )}
                      <ChevronRight
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Case Activities Timeline */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {caseActivities?.loading ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2">Loading activities...</p>
                      </div>
                    ) : dates.length === 0 ? (
                      <div className="p-8 text-center text-gray-600">
                        <p className="text-sm">
                          {searchQuery ? 'No activities match your search.' : 'No activities found for this case.'}
                        </p>
                      </div>
                    ) : (
                      <div className="relative bg-gradient-to-b from-purple-50 to-white p-4 md:p-6">
                        {/* Scroll Navigation Buttons */}
                        {canScrollLeft.get(caseItem.id) && (
                          <button
                            onClick={() => scrollTimeline(caseItem.id, 'left')}
                            className="fixed left-2 sm:left-4 top-1/2 -translate-y-1/2 z-50 bg-white/90 hover:bg-white border-2 border-purple-300 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
                            aria-label="Scroll left"
                          >
                            <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                          </button>
                        )}
                        {canScrollRight.get(caseItem.id) && (
                          <button
                            onClick={() => scrollTimeline(caseItem.id, 'right')}
                            className="fixed right-2 sm:right-4 top-1/2 -translate-y-1/2 z-50 bg-white/90 hover:bg-white border-2 border-purple-300 rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center shadow-lg transition-all hover:scale-110"
                            aria-label="Scroll right"
                          >
                            <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                          </button>
                        )}

                        {/* Timeline Container */}
                        <div
                          ref={(el) => {
                            if (el) {
                              timelineScrollRefs.current.set(caseItem.id, el)
                            } else {
                              timelineScrollRefs.current.delete(caseItem.id)
                            }
                          }}
                          onScroll={() => checkScrollButtons(caseItem.id)}
                          className="w-full overflow-x-auto overflow-y-visible pb-6 scrollbar-thin scrollbar-thumb-purple-400 scrollbar-track-gray-100"
                          style={{
                            WebkitOverflowScrolling: 'touch',
                            scrollbarWidth: 'thin',
                            scrollbarColor: '#c084fc #f3f4f6'
                          }}
                        >
                          <div className="min-w-max">
                            {/* Timeline Axis */}
                            <div className="relative mb-6">
                              <div className="absolute top-6 left-0 right-0 h-1 bg-gradient-to-r from-purple-300 via-purple-500 to-purple-300" />
                              
                              {/* Date Markers */}
                              <div className="flex justify-between items-start relative gap-4">
                                {dates.map((date) => (
                                  <div key={date} className="flex flex-col items-center min-w-[150px] md:min-w-[200px] flex-shrink-0">
                                    <div className="w-3 h-3 md:w-4 md:h-4 rounded-full bg-purple-600 border-2 md:border-4 border-white shadow-lg z-10 mb-2" />
                                    <div className="text-xs md:text-sm font-semibold text-purple-900 mb-1 text-center px-1">
                                      {date}
                                    </div>
                                    <div className="text-xs text-gray-500 text-center">
                                      {filteredGrouped[date].length} {filteredGrouped[date].length === 1 ? 'activity' : 'activities'}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Activities by Date */}
                            <div className="flex gap-4 md:gap-6">
                              {dates.map((date) => (
                                <div key={date} className="min-w-[180px] md:min-w-[240px] max-w-[240px] md:max-w-[300px] flex-shrink-0">
                                  <div className="space-y-3 md:space-y-4">
                                    {filteredGrouped[date].map((activity, index) => (
                                      <div key={activity.id} className="relative">
                                        {/* Connecting line from timeline */}
                                        {index === 0 && (
                                          <div className="absolute -top-8 left-1/2 w-0.5 h-8 bg-purple-300" />
                                        )}
                                        
                                        {/* Activity Card */}
                                        <div className="bg-white border-2 border-purple-200 rounded-lg p-3 md:p-4 hover:shadow-lg hover:border-purple-400 transition-all">
                                          {/* Action Type Badge */}
                                          <div className="flex items-center justify-between mb-2">
                                            <span className={`px-2 py-1 text-xs font-medium rounded border ${getActionTypeColor(activity.action_type)}`}>
                                              {activity.action_type}
                                            </span>
                                            <div className="text-purple-600">
                                              {getResourceTypeIcon(activity.resource_type)}
                                            </div>
                                          </div>

                                          {/* Description */}
                                          <p className="text-sm text-gray-900 font-medium mb-2 line-clamp-2">
                                            {activity.description}
                                          </p>

                                          {/* Metadata */}
                                          <div className="space-y-1 text-xs text-gray-600">
                                            <div className="flex items-center gap-1">
                                              <Clock className="w-3 h-3" />
                                              <span>{formatTime(activity.created_at)}</span>
                                            </div>
                                            {activity.username && (
                                              <div className="flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                <span>{activity.username}</span>
                                              </div>
                                            )}
                                            <div className="text-gray-500 italic">
                                              {formatActivityTime(activity.created_at)}
                                            </div>
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

