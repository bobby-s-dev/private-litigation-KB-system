'use client'

import { usePathname, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

export default function CaseHeader() {
  const pathname = usePathname()
  const params = useParams()
  const caseId = params?.caseId as string
  const [caseTitle, setCaseTitle] = useState<string | null>(null)
  const [loadingCase, setLoadingCase] = useState(false)

  // Fetch case title from API
  useEffect(() => {
    const fetchCaseTitle = async () => {
      if (!caseId) {
        setCaseTitle(null)
        return
      }

      try {
        setLoadingCase(true)
        const matter = await apiClient.getMatter(caseId)
        setCaseTitle(matter.matter_name || matter.matter_number)
      } catch (error) {
        console.error('Error fetching case title:', error)
        setCaseTitle(null)
      } finally {
        setLoadingCase(false)
      }
    }

    fetchCaseTitle()
  }, [caseId])

  const tabs = [
    { name: 'Case Home', path: caseId ? `/cases/${caseId}` : '#' },
    { name: 'Facts', path: caseId ? `/cases/${caseId}/facts` : '#' },
    { name: 'Entities', path: caseId ? `/cases/${caseId}/entities` : '#' },
    { name: 'Issues', path: '#' },
    { name: 'Sources', path: caseId ? `/cases/${caseId}/resources` : '#' },
    { name: 'Tasks', path: '#' },
    { name: 'Reports', path: '#' },
    { name: 'Activity', path: caseId ? `/cases/${caseId}/activity` : '#' },
    { name: 'Usage', path: '#' },
    { name: 'Knowledge Base', path: caseId ? `/cases/${caseId}/knowledge` : '#' },
  ]

  const getActiveTab = () => {
    if (!pathname || !caseId) return 0
    if (pathname === `/cases/${caseId}`) return 0
    if (pathname === `/cases/${caseId}/facts`) return 1
    if (pathname === `/cases/${caseId}/entities`) return 2
    if (pathname === `/cases/${caseId}/knowledge`) return 3
    if (pathname === `/cases/${caseId}/resources`) return 4
    if (pathname === `/cases/${caseId}/activity`) return 7
    return -1
  }

  const activeTab = getActiveTab()

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="px-6 py-4">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {loadingCase ? 'Loading...' : (caseTitle || (caseId ? `Case ${caseId}` : 'Case'))}
        </h1>
      </div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 px-6">
        {tabs.map((tab, index) => {
          const isActive = activeTab === index
          const className = `px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'border-b-2 text-primary-600 dark:text-primary-400'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          } ${tab.path === '#' ? 'cursor-not-allowed opacity-50' : ''}`
          
          const borderStyle = isActive ? { borderBottomColor: 'var(--primary-color)' } : {}

          if (tab.path === '#') {
            return (
              <button
                key={tab.name}
                disabled
                className={className}
                style={borderStyle}
              >
                {tab.name}
              </button>
            )
          }

          return (
            <Link
              key={tab.name}
              href={tab.path}
              className={className}
              style={borderStyle}
            >
              {tab.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

