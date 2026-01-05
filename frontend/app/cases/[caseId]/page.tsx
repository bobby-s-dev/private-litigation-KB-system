'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import FeatureCards from '@/components/FeatureCards'
import RecentlyUploadedSources from '@/components/RecentlyUploadedSources'
import FactsPerEntity from '@/components/FactsPerEntity'
import DocumentUpload from '@/components/DocumentUpload'
import { apiClient } from '@/lib/api'

const recentActivities = [
  { action: 'You created a task', time: '12/26/2025 at 2:01 pm / 9 days ago' },
  { action: 'You assigned a user to a case', time: '12/26/2025 at 1:56 pm / 9 days ago' },
]

export default function CaseHomePage() {
  const params = useParams()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)

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
  }

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

          <div className="grid grid-cols-2 gap-6 mb-6">
            {/* Case Description */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Case description</h2>
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                + add description
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
              <button className="text-sm text-purple-600 hover:text-purple-700 font-medium px-3 py-1 border border-purple-200 rounded hover:bg-purple-50">
                Refresh
              </button>
            </div>
            <p className="text-gray-600 text-sm">No recent sources yet...</p>
          </div>

          {/* Recently Uploaded Sources */}
          <div className="mb-6">
            <RecentlyUploadedSources matterId={caseId} refreshKey={refreshKey} />
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Recent Activity */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent activity</h2>
                <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                  View all
                </button>
              </div>
              <div className="space-y-4">
                {recentActivities.map((activity, index) => (
                  <div key={index} className="border-b border-gray-100 pb-3 last:border-0">
                    <p className="text-sm text-gray-900 font-medium">{activity.action}</p>
                    <p className="text-xs text-gray-500 mt-1">{activity.time}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Facts per Entity */}
            <FactsPerEntity />
          </div>
    </div>
  )
}

