'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Calendar, Clock, User, FileText, Activity as ActivityIcon } from 'lucide-react'
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
    
    // First, consolidate upload activities that occur close together
    const consolidatedActivities = consolidateUploadActivities(activities)
    
    consolidatedActivities.forEach(activity => {
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

  const consolidateUploadActivities = (activities: Activity[]): Activity[] => {
    // Group upload activities by time window (within 10 seconds)
    const uploadGroups: Activity[][] = []
    const nonUploadActivities: Activity[] = []
    const TIME_WINDOW_MS = 10000 // 10 seconds

    // Separate upload and non-upload activities
    const uploadActivities = activities.filter(a => 
      a.action_type.toLowerCase() === 'import' || 
      a.action_type.toLowerCase() === 'upload'
    )
    const otherActivities = activities.filter(a => 
      a.action_type.toLowerCase() !== 'import' && 
      a.action_type.toLowerCase() !== 'upload'
    )

    // Sort upload activities by time
    uploadActivities.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Group consecutive upload activities within time window
    let currentGroup: Activity[] = []
    uploadActivities.forEach((activity, index) => {
      if (currentGroup.length === 0) {
        currentGroup.push(activity)
      } else {
        const lastActivity = currentGroup[currentGroup.length - 1]
        const timeDiff = new Date(activity.created_at).getTime() - new Date(lastActivity.created_at).getTime()
        
        if (timeDiff <= TIME_WINDOW_MS) {
          currentGroup.push(activity)
        } else {
          // Start a new group
          if (currentGroup.length > 0) {
            uploadGroups.push([...currentGroup])
          }
          currentGroup = [activity]
        }
      }
    })
    
    // Add the last group
    if (currentGroup.length > 0) {
      uploadGroups.push(currentGroup)
    }

    // Consolidate groups with multiple activities
    const consolidated: Activity[] = []
    
    uploadGroups.forEach(group => {
      if (group.length === 1) {
        // Single upload, keep as is
        consolidated.push(group[0])
      } else {
        // Multiple uploads, create a consolidated activity
        const firstActivity = group[0]
        const totalFiles = group.length
        const totalSizeMB = group.reduce((sum, a) => {
          const size = a.metadata?.file_size_mb || 0
          return sum + size
        }, 0)
        
        // Count folders (files with path separators)
        const folders = new Set(
          group
            .map(a => {
              const filename = a.metadata?.filename || a.description.match(/"([^"]+)"/)?.[1] || ''
              const pathParts = filename.split(/[/\\]/).filter((p: string) => p)
              return pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : null
            })
            .filter((f: string | null) => f !== null)
        )
        const folderCount = folders.size

        // Create consolidated description
        let description = `Uploaded ${totalFiles} ${totalFiles === 1 ? 'file' : 'files'}`
        if (folderCount > 0) {
          description += ` from ${folderCount} ${folderCount === 1 ? 'folder' : 'folders'}`
        }
        if (totalSizeMB > 0) {
          const sizeStr = totalSizeMB >= 1024 
            ? `${(totalSizeMB / 1024).toFixed(2)} GB`
            : `${totalSizeMB.toFixed(2)} MB`
          description += ` (${sizeStr})`
        }

        // Create consolidated activity
        const consolidatedActivity: Activity = {
          ...firstActivity,
          description,
          metadata: {
            ...firstActivity.metadata,
            consolidated: true,
            file_count: totalFiles,
            folder_count: folderCount,
            total_size_mb: totalSizeMB,
            original_activities: group.map(a => ({
              id: a.id,
              description: a.description,
              filename: a.metadata?.filename
            }))
          }
        }
        
        consolidated.push(consolidatedActivity)
      }
    })

    // Add non-upload activities
    consolidated.push(...otherActivities)

    return consolidated
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


  const getActionTypeColor = (actionType: string): string => {
    const colors: Record<string, string> = {
      'create': 'bg-green-100 text-green-800 border-green-300',
      'update': 'bg-blue-100 text-blue-800 border-blue-300',
      'delete': 'bg-red-100 text-red-800 border-red-300',
      'upload': 'bg-primary-100 text-primary-800 border-primary-300',
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
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Activities</h1>
        <p className="text-gray-600 dark:text-gray-400">View activities across all cases, organized by date</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search activities by description, action type, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>
          <div className="sm:w-64">
            <select
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
          <p className="text-gray-600 dark:text-gray-400">No cases found.</p>
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
              <div key={caseItem.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Case Header */}
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => toggleCaseExpansion(caseItem.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{caseItem.matter_name}</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">Case #{caseItem.matter_number}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      {caseActivities && (
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {caseActivities.activities.length} {caseActivities.activities.length === 1 ? 'activity' : 'activities'}
                        </div>
                      )}
                      <ChevronRight
                        className={`w-5 h-5 text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </div>
                  </div>
                </div>

                {/* Case Activities Timeline */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {caseActivities?.loading ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 mx-auto"></div>
                        <p className="text-sm text-gray-600 mt-2">Loading activities...</p>
                      </div>
                    ) : dates.length === 0 ? (
                      <div className="p-8 text-center text-gray-600 dark:text-gray-400">
                        <p className="text-sm">
                          {searchQuery ? 'No activities match your search.' : 'No activities found for this case.'}
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 md:p-6 bg-gray-50 dark:bg-gray-900">
                        {/* Activities by Date - Row Layout */}
                        <div className="space-y-6">
                          {dates.map((date) => (
                            <div key={date} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                              {/* Date Header */}
                              <div className="px-4 py-3 border-b" style={{ 
                                background: `linear-gradient(to right, var(--primary-500), var(--primary-600))`,
                                borderColor: 'var(--primary-700)'
                              }}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Calendar className="w-5 h-5 text-white" />
                                    <h3 className="text-lg font-semibold text-white">{date}</h3>
                                  </div>
                                  <div className="text-sm" style={{ color: 'var(--primary-100)' }}>
                                    {filteredGrouped[date].length} {filteredGrouped[date].length === 1 ? 'activity' : 'activities'}
                                  </div>
                                </div>
                              </div>

                              {/* Activities Table */}
                              <div className="overflow-x-auto">
                                <table className="w-full">
                                  <thead className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Time</th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Action</th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">User</th>
                                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Resource</th>
                                    </tr>
                                  </thead>
                                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredGrouped[date].map((activity) => (
                                      <tr key={activity.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <div className="flex flex-col">
                                            <div className="flex items-center gap-1 text-sm text-gray-900 dark:text-gray-100">
                                              <Clock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                                              <span>{formatTime(activity.created_at)}</span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                              {formatActivityTime(activity.created_at)}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <span className={`px-2 py-1 text-xs font-medium rounded border ${getActionTypeColor(activity.action_type)}`}>
                                            {activity.action_type}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div>
                                            <p className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                                              {activity.description}
                                            </p>
                                            {activity.metadata?.consolidated && (
                                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                {activity.metadata.file_count} {activity.metadata.file_count === 1 ? 'file' : 'files'}
                                                {activity.metadata.folder_count > 0 && (
                                                  <> • {activity.metadata.folder_count} {activity.metadata.folder_count === 1 ? 'folder' : 'folders'}</>
                                                )}
                                              </p>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          {activity.username ? (
                                            <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                                              <User className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                              <span>{activity.username}</span>
                                            </div>
                                          ) : (
                                            <span className="text-sm text-gray-400 dark:text-gray-500 italic">—</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <div className="flex items-center gap-2" style={{ color: 'var(--primary-color)' }}>
                                            {getResourceTypeIcon(activity.resource_type)}
                                            <span className="text-sm text-gray-600 dark:text-gray-400 capitalize">{activity.resource_type}</span>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
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

