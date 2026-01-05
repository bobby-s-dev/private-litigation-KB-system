'use client'

export default function CaseHeader() {
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
        {[
          'Case Home',
          'Facts',
          'Entities',
          'Issues',
          'Sources',
          'Search',
          'Tasks',
          'Reports',
          'Activity',
          'Usage',
        ].map((tab, index) => (
          <button
            key={tab}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              index === 0
                ? 'border-b-2 border-purple-600 text-purple-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
    </div>
  )
}

