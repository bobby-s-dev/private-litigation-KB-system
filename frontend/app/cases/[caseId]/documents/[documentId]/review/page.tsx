'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

interface SuggestedFact {
  id: string
  fact: string
  confidence: number
  source_text: string
  page_number?: number
}

interface Entity {
  id: string
  name: string
  type: string
  mentions: number
  confidence: number
}

interface DocumentSummary {
  summary: string
  key_points: string[]
  topics: string[]
}

export default function DocumentReviewPage() {
  const params = useParams()
  const router = useRouter()
  const documentId = params?.documentId as string
  const caseId = params?.caseId as string
  
  const [document, setDocument] = useState<any>(null)
  const [suggestedFacts, setSuggestedFacts] = useState<SuggestedFact[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [summary, setSummary] = useState<DocumentSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'facts' | 'entities' | 'summary'>('facts')

  useEffect(() => {
    if (documentId) {
      loadReviewData()
    }
  }, [documentId])

  const loadReviewData = async () => {
    try {
      setLoading(true)
      
      // Load document details
      const doc = await apiClient.getDocument(documentId)
      setDocument(doc)
      
      // Load review data in parallel
      const [facts, entitiesData, summaryData] = await Promise.all([
        apiClient.getSuggestedFacts(documentId),
        apiClient.getDocumentEntities(documentId),
        apiClient.getDocumentSummary(documentId)
      ])
      
      setSuggestedFacts(facts)
      setEntities(entitiesData)
      setSummary(summaryData)
    } catch (error) {
      console.error('Error loading review data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading review...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-purple-600 hover:text-purple-700 mb-4 flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Review: {document?.file_name || 'Document'}
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          <button
            onClick={() => setActiveTab('facts')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'facts'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Suggested Facts
          </button>
          <button
            onClick={() => setActiveTab('entities')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'entities'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Entities
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`pb-3 px-1 border-b-2 font-medium transition-colors ${
              activeTab === 'summary'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Document Summary
          </button>
        </nav>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {activeTab === 'facts' && (
          <SuggestedFactsSection facts={suggestedFacts} />
        )}
        {activeTab === 'entities' && (
          <EntitiesSection entities={entities} />
        )}
        {activeTab === 'summary' && (
          <DocumentSummarySection summary={summary} />
        )}
      </div>
    </div>
  )
}

function SuggestedFactsSection({ facts }: { facts: SuggestedFact[] }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Suggested Facts
        </h2>
        <p className="text-sm text-gray-600">
          Review a set of suggested facts, made by our Document Intelligence engine.
        </p>
      </div>

      {facts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No suggested facts available yet.</p>
          <p className="text-sm mt-2">Facts will be extracted automatically as the document is processed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {facts.map((fact) => (
            <div
              key={fact.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <p className="text-gray-900 font-medium flex-1">{fact.fact}</p>
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-gray-500">
                    {Math.round(fact.confidence * 100)}% confidence
                  </span>
                  <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                    Accept
                  </button>
                  <button className="text-gray-400 hover:text-gray-600 text-sm">
                    Reject
                  </button>
                </div>
              </div>
              {fact.source_text && (
                <div className="mt-2 p-2 bg-gray-50 rounded text-sm text-gray-600">
                  <span className="font-medium">Source:</span> "{fact.source_text}"
                  {fact.page_number && (
                    <span className="ml-2 text-gray-400">(Page {fact.page_number})</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EntitiesSection({ entities }: { entities: Entity[] }) {
  const groupedEntities = entities.reduce((acc, entity) => {
    if (!acc[entity.type]) {
      acc[entity.type] = []
    }
    acc[entity.type].push(entity)
    return acc
  }, {} as Record<string, Entity[]>)

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Entities
        </h2>
        <p className="text-sm text-gray-600">
          View entities (persons, businesses, etc.) related to this source.
        </p>
      </div>

      {entities.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No entities found in this document.</p>
          <p className="text-sm mt-2">Entities will be extracted automatically as the document is processed.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedEntities).map(([type, typeEntities]) => (
            <div key={type}>
              <h3 className="text-md font-semibold text-gray-700 mb-3 capitalize">
                {type.replace('_', ' ')} ({typeEntities.length})
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {typeEntities.map((entity) => (
                  <div
                    key={entity.id}
                    className="border border-gray-200 rounded-lg p-3 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{entity.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {entity.mentions} mention{entity.mentions !== 1 ? 's' : ''} • {Math.round(entity.confidence * 100)}% confidence
                        </p>
                      </div>
                      <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">
                        View
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentSummarySection({ summary }: { summary: DocumentSummary | null }) {
  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Document Summary
        </h2>
        <p className="text-sm text-gray-600">
          View an automatic summarization of this document, with links to key information.
        </p>
      </div>

      {!summary ? (
        <div className="text-center py-12 text-gray-500">
          <p>No summary available yet.</p>
          <p className="text-sm mt-2">Summary will be generated automatically as the document is processed.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Main Summary */}
          <div>
            <h3 className="text-md font-semibold text-gray-700 mb-3">Summary</h3>
            <p className="text-gray-700 leading-relaxed">{summary.summary}</p>
          </div>

          {/* Key Points */}
          {summary.key_points && summary.key_points.length > 0 && (
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3">Key Points</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {summary.key_points.map((point, index) => (
                  <li key={index}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Topics */}
          {summary.topics && summary.topics.length > 0 && (
            <div>
              <h3 className="text-md font-semibold text-gray-700 mb-3">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {summary.topics.map((topic, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

