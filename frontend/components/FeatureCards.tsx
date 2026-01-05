'use client'

const features = [
  {
    icon: '📄',
    title: 'Summarize documents',
    description: 'Instantly generate clear, concise summaries of your case documents.',
  },
  {
    icon: '🔍',
    title: 'Search facts',
    description: 'Quickly find key facts and connections across your case files.',
  },
  {
    icon: '📋',
    title: 'Outline claims and issues',
    description: 'Get structured outlines of claims, defenses, and legal issues in seconds.',
  },
  {
    icon: '💡',
    title: 'Brainstorm next steps',
    description: 'Receive smart suggestions for strategic next actions based on case context.',
  },
  {
    icon: '📚',
    title: 'Search my documents',
    description: 'Ask questions and locate specific information within your uploaded files.',
  },
]

export default function FeatureCards() {
  return (
    <div className="grid grid-cols-5 gap-4 mb-8">
      {features.map((feature, index) => (
        <div
          key={index}
          className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer relative group"
        >
          <div className="text-3xl mb-3">{feature.icon}</div>
          <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
          <p className="text-sm text-gray-600">{feature.description}</p>
          <div className="absolute bottom-4 right-4 text-gray-400 group-hover:text-purple-600 transition-colors">
            →
          </div>
        </div>
      ))}
    </div>
  )
}

