'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Brain, Plus, RefreshCw, ArrowRight } from 'lucide-react'
import FeatureCards from '@/components/FeatureCards'
import RecentlyUploadedSources from '@/components/RecentlyUploadedSources'
import FactsPerEntity from '@/components/FactsPerEntity'
import DocumentUpload from '@/components/DocumentUpload'
import { apiClient } from '@/lib/api'

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

export default function CaseHomePage() {
  const router = useRouter()
  const params = useParams()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loadingActivities, setLoadingActivities] = useState(false)

  useEffect(() => {
    const initializeMatter = async () => {
      if (!caseIdParam) {
        setLoading(false)
        return
      }

      try {
        // Try to get the matter by ID or matter_number
        let matter
        try {
          matter = await apiClient.getMatter(caseIdParam)
        } catch (error) {
          // If not found, create a new matter with the caseId as matter_number
          matter = await apiClient.createMatter(
            caseIdParam,
            `Case ${caseIdParam}`
          )
        }
        setCaseId(matter.id)
      } catch (error) {
        console.error('Error initializing matter:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeMatter()
  }, [caseIdParam])

  const handleUploadSuccess = () => {
    setRefreshKey(prev => prev + 1)
    loadActivities()
  }

  const loadActivities = async () => {
    if (!caseId) return
    
    try {
      setLoadingActivities(true)
      const response = await apiClient.getMatterActivities(caseId, 8, 0)
      // Handle both response formats (array or object with activities property)
      if (Array.isArray(response)) {
        setActivities(response)
      } else if (response?.activities) {
        setActivities(response.activities)
      } else {
        setActivities([])
      }
    } catch (error) {
      console.error('Error loading activities:', error)
      setActivities([])
    } finally {
      setLoadingActivities(false)
    }
  }

  useEffect(() => {
    if (caseId) {
      loadActivities()
    }
  }, [caseId])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading case...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
          <FeatureCards />

          {/* Knowledge Base Quick Access */}
          {caseId && (
            <div className="mb-6">
              <Link href={`/cases/${caseIdParam}/knowledge`}>
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-lg border border-purple-200 shadow-lg p-6 text-white hover:shadow-xl transition-shadow cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">AI Knowledge Base</h2>
                      <p className="text-purple-100 mb-4">
                        Discover patterns, ask questions, and generate summaries with AI-powered insights
                      </p>
                      <div className="flex gap-4 text-sm">
                        <span className="bg-white/20 px-3 py-1 rounded-full">Pattern Detection</span>
                        <span className="bg-white/20 px-3 py-1 rounded-full">AI Q&A</span>
                        <span className="bg-white/20 px-3 py-1 rounded-full">Summary Generation</span>
                      </div>
                    </div>
                    <Brain className="h-16 w-16 text-white/80" />
                  </div>
                </div>
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Case Description */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Case description</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1">
                <Plus className="h-4 w-4" />
                add description
              </button>
            </div>

            {/* Add Documents to Review */}
            {caseId && (
              <DocumentUpload matterId={caseId} onUploadSuccess={handleUploadSuccess} />
            )}
          </div>

          {/* Resume Review */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Resume review</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium px-3 py-1 border border-purple-200 rounded hover:bg-purple-50 flex items-center gap-1">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
            <p className="text-gray-600 text-sm">No recent sources yet...</p>
          </div>

          {/* Recently Uploaded Sources */}
          <div className="mb-6">
            <RecentlyUploadedSources matterId={caseId ?? undefined} refreshKey={refreshKey} limit={10} showViewAll={true} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
                <div className="flex items-center gap-3">
                  <button 
                    onClick={loadActivities}
                    className="text-sm text-gray-600 hover:text-gray-700 font-medium flex items-center gap-1"
                    disabled={loadingActivities}
                  >
                    <RefreshCw className={`h-4 w-4 ${loadingActivities ? 'animate-spin' : ''}`} />
                    {loadingActivities ? 'Loading...' : 'Refresh'}
                  </button>
                  {caseId && (
                    <button 
                      onClick={() => router.push(`/cases/${caseId}/activity`)}
                      className="text-sm text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                    >
                      View all
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-4">
                {loadingActivities ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="text-xs text-gray-500 mt-2">Loading activities...</p>
                  </div>
                ) : !activities || activities.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No recent activities</p>
                ) : (
                  activities.map((activity) => (
                    <div key={activity.id} className="border-b border-gray-100 pb-3 last:border-0">
                      <p className="text-sm text-gray-900 font-medium">{activity.description}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatActivityTime(activity.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Facts per Entity */}
            <FactsPerEntity matterId={caseId} />
          </div>
    </div>
  )
}

function formatActivityTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  
  // Format date
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
  
  // Relative time
  if (diffMins < 1) {
    return 'Just now'
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  } else {
    return `${dateStr} at ${timeStr}`
  }
}

