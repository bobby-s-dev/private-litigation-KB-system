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
    { name: 'Entities', path: '#' },
    { name: 'Issues', path: '#' },
    { name: 'Sources', path: '#' },
    { name: 'Search', path: '#' },
    { name: 'Tasks', path: '#' },
    { name: 'Reports', path: '#' },
    { name: 'Activity', path: '#' },
    { name: 'Usage', path: '#' },
  ]

  const getActiveTab = () => {
    if (!pathname || !caseId) return 0
    if (pathname === `/cases/${caseId}`) return 0
    if (pathname === `/cases/${caseId}/facts`) return 1
    return -1
  }

  const activeTab = getActiveTab()

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          
        </div>
        <div className="flex items-center gap-4">
          <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
            AI assistant
          </button>
          <button className="text-gray-600 hover:text-gray-900">
            🔔
          </button>
          <button className="w-8 h-8 bg-gray-300 rounded-full"></button>
        </div>
      </div>

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

