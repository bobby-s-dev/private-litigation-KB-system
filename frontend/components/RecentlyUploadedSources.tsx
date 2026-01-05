'use client'

interface Source {
  name: string
  citations: number
  uploaded: string
  relatedFacts?: number
}

const sources: Source[] = [
  { name: 'Stipulations.pdf', citations: 1, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 1 },
  { name: 'Lane Parish Statement.pdf', citations: 28, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 24 },
  { name: 'Ex 9 (News Article)', citations: 0, uploaded: '12/26/2025 at 1:13 pm' },
  { name: 'Ex 8 (Internal Investigation Findings)', citations: 3, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 3 },
  { name: 'Ex 7 (Lane & Fox Emails)', citations: 5, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 4 },
  { name: 'Ex 6 (Phishing Email)', citations: 1, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 1 },
  { name: 'Ex 5 (Texoma Hospital Policies & Procedures)', citations: 1, uploaded: '12/26/2025 at 1:13 pm', relatedFacts: 1 },
]

export default function RecentlyUploadedSources() {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recently uploaded sources</h2>
        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
          View all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Name</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Number of Citations</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Uploaded</th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700"></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source, index) => (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4">
                  <div className="font-medium text-gray-900">{source.name}</div>
                  {source.relatedFacts && (
                    <button className="text-sm text-purple-600 hover:text-purple-700 mt-1">
                      View {source.relatedFacts} related fact{source.relatedFacts !== 1 ? 's' : ''}
                    </button>
                  )}
                </td>
                <td className="py-3 px-4 text-gray-700">{source.citations}</td>
                <td className="py-3 px-4 text-gray-600 text-sm">{source.uploaded}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <button className="bg-purple-600 text-white px-3 py-1 rounded text-sm hover:bg-purple-700 transition-colors">
                      Launch Reviewer
                    </button>
                    <button className="text-gray-400 hover:text-gray-600">
                      ✏️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

