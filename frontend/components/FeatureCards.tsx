'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'

const features = [
  {
    icon: '📄',
    title: 'Summarize documents',
    description: 'Instantly generate clear, concise summaries of your case documents.',
    path: 'knowledge', // Links to knowledge base summary tab
  },
  {
    icon: '🔍',
    title: 'Search facts',
    description: 'Quickly find key facts and connections across your case files.',
    path: 'facts',
  },
  {
    icon: '📋',
    title: 'Outline claims and issues',
    description: 'Get structured outlines of claims, defenses, and legal issues in seconds.',
    path: 'knowledge', // Links to knowledge base
  },
  {
    icon: '💡',
    title: 'Brainstorm next steps',
    description: 'Receive smart suggestions for strategic next actions based on case context.',
    path: 'knowledge', // Links to knowledge base suggestions
  },
  {
    icon: '📚',
    title: 'Search my documents',
    description: 'Ask questions and locate specific information within your uploaded files.',
    path: 'knowledge', // Links to knowledge base query tab
  },
]

export default function FeatureCards() {
  const params = useParams()
  const caseId = params?.caseId as string

  return (
    <div className="grid grid-cols-5 gap-4 mb-8">
      {features.map((feature, index) => {
        const href = caseId ? `/cases/${caseId}/${feature.path}` : '#'
        const isDisabled = !caseId || feature.path === '#'
        
        const cardContent = (
          <div
            className={`bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow relative group ${
              isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
            }`}
          >
            <div className="text-3xl mb-3">{feature.icon}</div>
            <h3 className="font-semibold text-gray-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-gray-600">{feature.description}</p>
            <div className="absolute bottom-4 right-4 text-gray-400 group-hover:text-purple-600 transition-colors">
              →
            </div>
          </div>
        )

        if (isDisabled) {
          return <div key={index}>{cardContent}</div>
        }

        return (
          <Link key={index} href={href}>
            {cardContent}
          </Link>
        )
      })}
    </div>
  )
}

