'use client'

export default function CaseHeader() {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-purple-600 rounded flex items-center justify-center text-white font-semibold text-sm">
            ML
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Texoma v. Jackson (Sample Case)
            </h1>
            <p className="text-sm text-gray-600">Status: Open</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
            <p className="text-sm text-yellow-800">
              4 days remain on your free trial
            </p>
          </div>
          <button className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors">
            Subscribe Now
          </button>
          <div className="text-sm text-gray-700">Maria Lee Consulting</div>
          <button className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors">
            AI assistant
          </button>
          <button className="text-gray-600 hover:text-gray-900">
            🔔
          </button>
          <button className="w-8 h-8 bg-gray-300 rounded-full"></button>
        </div>
      </div>
      
      <div className="flex items-center gap-2 mb-2">
        <div className="text-sm text-gray-600">Assigned users: </div>
        <div className="w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
          ML
        </div>
        <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
          +
        </button>
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

