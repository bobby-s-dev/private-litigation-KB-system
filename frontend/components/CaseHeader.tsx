'use client'

import { usePathname, useParams } from 'next/navigation'
import Link from 'next/link'

export default function CaseHeader() {
  const pathname = usePathname()
  const params = useParams()
  const caseId = params?.caseId as string

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
    if (pathname === `/cases/${caseId}/resources`) return 5
    if (pathname === `/cases/${caseId}/activity`) return 9
    return -1
  }

  const activeTab = getActiveTab()

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab, index) => {
          const isActive = activeTab === index
          const className = `px-4 py-2 text-sm font-medium transition-colors ${
            isActive
              ? 'border-b-2 border-purple-600 text-purple-600'
              : 'text-gray-600 hover:text-gray-900'
          } ${tab.path === '#' ? 'cursor-not-allowed opacity-50' : ''}`

          if (tab.path === '#') {
            return (
              <button
                key={tab.name}
                disabled
                className={className}
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
            >
              {tab.name}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

