'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

interface SuggestedFact {
  id: string
  fact: string
  event_date?: string | null
  tags?: string[]
  confidence: number
  source_text: string
  page_number?: number
  review_status?: string
}

interface Entity {
  id: string
  name: string
  type: string
  mentions: number
  confidence: number
  review_status?: string
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

  const loadReviewData = async () => {
    try {
      setLoading(true)
      
      // Load document details
      const doc = await apiClient.getDocument(documentId)
      setDocument(doc)
      
      // Load review data in parallel with error handling for each
      const [facts, entitiesData, summaryData] = await Promise.allSettled([
        apiClient.getSuggestedFacts(documentId).catch(err => {
          console.error('Error loading facts:', err)
          return []
        }),
        apiClient.getDocumentEntities(documentId).catch(err => {
          console.error('Error loading entities:', err)
          return []
        }),
        apiClient.getDocumentSummary(documentId).catch(err => {
          console.error('Error loading summary:', err)
          return null
        })
      ])
      
      setSuggestedFacts(facts.status === 'fulfilled' ? facts.value : [])
      setEntities(entitiesData.status === 'fulfilled' ? entitiesData.value : [])
      setSummary(summaryData.status === 'fulfilled' ? summaryData.value : null)
    } catch (error) {
      console.error('Error loading review data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (documentId) {
      loadReviewData()
    }
    
    // Auto-refresh every 5 seconds if document is still processing
    const interval = setInterval(() => {
      if (documentId && document?.processing_status === 'processing') {
        loadReviewData()
      }
    }, 5000)
    
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId])

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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Review: {document?.file_name || 'Document'}
          </h1>
          <button
            onClick={loadReviewData}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>
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
            {suggestedFacts.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                {suggestedFacts.length}
              </span>
            )}
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
            {entities.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                {entities.length}
              </span>
            )}
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
          <SuggestedFactsSection facts={suggestedFacts} documentId={documentId} onFactsExtracted={loadReviewData} />
        )}
        {activeTab === 'entities' && (
          <EntitiesSection entities={entities} documentId={documentId} onEntitiesExtracted={loadReviewData} />
        )}
        {activeTab === 'summary' && (
          <DocumentSummarySection summary={summary} />
        )}
      </div>
    </div>
  )
}

function SuggestedFactsSection({ 
  facts: initialFacts, 
  documentId, 
  onFactsExtracted 
}: { 
  facts: SuggestedFact[]
  documentId: string
  onFactsExtracted: () => void
}) {
  const [facts, setFacts] = useState<SuggestedFact[]>(initialFacts)
  const [deletingFactId, setDeletingFactId] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [factToDelete, setFactToDelete] = useState<string | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)

  // Update facts when initialFacts changes
  useEffect(() => {
    setFacts(initialFacts)
  }, [initialFacts])

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return null
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    } catch {
      return dateStr
    }
  }

  const handleAccept = async (factId: string) => {
    try {
      await apiClient.updateFactReviewStatus(factId, 'accepted')
      setFacts(prevFacts =>
        prevFacts.map(fact =>
          fact.id === factId ? { ...fact, review_status: 'accepted' } : fact
        )
      )
    } catch (error) {
      console.error('Error accepting fact:', error)
      alert('Failed to accept fact. Please try again.')
    }
  }

  const handleRejectClick = (factId: string) => {
    setFactToDelete(factId)
    setShowConfirmDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!factToDelete) return

    try {
      setDeletingFactId(factToDelete)
      await apiClient.deleteFact(factToDelete)
      setFacts(prevFacts => prevFacts.filter(fact => fact.id !== factToDelete))
      setShowConfirmDialog(false)
      setFactToDelete(null)
    } catch (error) {
      console.error('Error deleting fact:', error)
      alert('Failed to delete fact. Please try again.')
    } finally {
      setDeletingFactId(null)
    }
  }

  const handleCancelDelete = () => {
    setShowConfirmDialog(false)
    setFactToDelete(null)
  }

  const handleExtractFacts = async () => {
    setIsExtracting(true)
    setExtractionError(null)
    try {
      const result = await apiClient.extractFacts(documentId)
      setFacts(result.facts)
      if (onFactsExtracted) {
        onFactsExtracted()
      }
      if (result.extracted_count === 0) {
        setExtractionError(result.message || 'No facts could be extracted from this document.')
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to extract facts. Please try again.'
      setExtractionError(errorMessage)
      console.error('Error extracting facts:', error)
    } finally {
      setIsExtracting(false)
    }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Suggested Facts
          </h2>
          {facts.length === 0 && (
            <button
              onClick={handleExtractFacts}
              disabled={isExtracting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isExtracting ? 'Extracting...' : 'Extract Facts'}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          Review a set of suggested facts, made by our Document Intelligence engine.
        </p>
      </div>

      {extractionError && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{extractionError}</p>
        </div>
      )}

      {facts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No suggested facts available yet.</p>
          <p className="text-sm mt-2">
            {isExtracting 
              ? 'Extracting facts from the document...' 
              : 'Facts are automatically extracted during document upload. Click "Extract Facts" to manually trigger extraction, or refresh the page.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-800">
              ✓ Found {facts.length} fact{facts.length !== 1 ? 's' : ''} extracted from this document
            </p>
          </div>
          <div className="space-y-4">
          {facts.map((fact) => (
            <div
              key={fact.id}
              className={`border rounded-lg p-4 transition-colors ${
                fact.review_status === 'accepted'
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-200 hover:border-purple-300'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-gray-900 font-medium">{fact.fact}</p>
                    {fact.review_status === 'accepted' && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                        Accepted
                      </span>
                    )}
                  </div>
                  
                  {/* Event Date */}
                  {fact.event_date && (
                    <div className="flex items-center gap-2 mb-2">
                      <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm text-gray-600 font-medium">
                        Event Date: {formatDate(fact.event_date)}
                      </span>
                    </div>
                  )}
                  
                  {/* Tags */}
                  {fact.tags && fact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {fact.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium"
                        >
                          {tag.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {Math.round(fact.confidence * 100)}% confidence
                  </span>
                  {fact.review_status !== 'accepted' && (
                    <>
                      <button
                        onClick={() => handleAccept(fact.id)}
                        className="text-purple-600 hover:text-purple-700 text-sm font-medium whitespace-nowrap"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleRejectClick(fact.id)}
                        disabled={deletingFactId === fact.id}
                        className="text-gray-400 hover:text-red-600 text-sm whitespace-nowrap disabled:opacity-50"
                      >
                        {deletingFactId === fact.id ? 'Deleting...' : 'Reject'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              
              {fact.source_text && (
                <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                  <span className="font-medium">Source:</span> "{fact.source_text}"
                  {fact.page_number && (
                    <span className="ml-2 text-gray-400">(Page {fact.page_number})</span>
                  )}
                </div>
              )}
            </div>
          ))}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Deletion</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to reject and permanently delete this fact? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Confirm & Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EntitiesSection({ entities: initialEntities, documentId, onEntitiesExtracted }: { entities: Entity[]; documentId: string; onEntitiesExtracted?: () => void }) {
  const [entities, setEntities] = useState<Entity[]>(initialEntities)
  const [isExtracting, setIsExtracting] = useState(false)
  const [extractionError, setExtractionError] = useState<string | null>(null)
  const [deletingEntityId, setDeletingEntityId] = useState<string | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [entityToDelete, setEntityToDelete] = useState<string | null>(null)

  // Update entities when initialEntities changes
  useEffect(() => {
    setEntities(initialEntities)
  }, [initialEntities])

  const handleExtractEntities = async () => {
    setIsExtracting(true)
    setExtractionError(null)
    try {
      const result = await apiClient.extractEntities(documentId)
      setEntities(result.entities)
      if (onEntitiesExtracted) {
        onEntitiesExtracted()
      }
      if (result.extracted_count === 0) {
        setExtractionError(result.message || 'No entities could be extracted from this document.')
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to extract entities. Please try again.'
      setExtractionError(errorMessage)
      console.error('Error extracting entities:', error)
    } finally {
      setIsExtracting(false)
    }
  }

  const handleAccept = async (entityId: string) => {
    try {
      await apiClient.updateEntityReviewStatus(entityId, 'accepted')
      setEntities(prevEntities =>
        prevEntities.map(entity =>
          entity.id === entityId ? { ...entity, review_status: 'accepted' } : entity
        )
      )
    } catch (error) {
      console.error('Error accepting entity:', error)
      alert('Failed to accept entity. Please try again.')
    }
  }

  const handleRejectClick = (entityId: string) => {
    setEntityToDelete(entityId)
    setShowConfirmDialog(true)
  }

  const handleConfirmDelete = async () => {
    if (!entityToDelete) return

    try {
      setDeletingEntityId(entityToDelete)
      await apiClient.deleteEntity(entityToDelete)
      setEntities(prevEntities => prevEntities.filter(entity => entity.id !== entityToDelete))
      setShowConfirmDialog(false)
      setEntityToDelete(null)
    } catch (error) {
      console.error('Error deleting entity:', error)
      alert('Failed to delete entity. Please try again.')
    } finally {
      setDeletingEntityId(null)
    }
  }

  const handleCancelDelete = () => {
    setShowConfirmDialog(false)
    setEntityToDelete(null)
  }

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
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-gray-900">
            Entities
          </h2>
          {entities.length === 0 && (
            <button
              onClick={handleExtractEntities}
              disabled={isExtracting}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              {isExtracting ? 'Extracting...' : 'Extract Entities'}
            </button>
          )}
        </div>
        <p className="text-sm text-gray-600">
          View entities (persons, businesses, etc.) related to this source.
        </p>
      </div>

      {extractionError && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">{extractionError}</p>
        </div>
      )}

      {entities.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>No entities found in this document.</p>
          <p className="text-sm mt-2">
            {isExtracting 
              ? 'Extracting entities from the document...' 
              : 'Entities are automatically extracted during document upload. Click "Extract Entities" to manually trigger extraction, or refresh the page.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              ✓ Found {entities.length} entit{entities.length !== 1 ? 'ies' : 'y'} extracted from this document
            </p>
          </div>
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
                    className={`border rounded-lg p-3 transition-colors ${
                      entity.review_status === 'accepted'
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-200 hover:border-purple-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-gray-900">{entity.name}</p>
                          {entity.review_status === 'accepted' && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                              Accepted
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {entity.mentions} mention{entity.mentions !== 1 ? 's' : ''} • {Math.round(entity.confidence * 100)}% confidence
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {entity.review_status !== 'accepted' && (
                          <>
                            <button
                              onClick={() => handleAccept(entity.id)}
                              className="text-purple-600 hover:text-purple-700 text-sm font-medium whitespace-nowrap"
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => handleRejectClick(entity.id)}
                              disabled={deletingEntityId === entity.id}
                              className="text-gray-400 hover:text-red-600 text-sm whitespace-nowrap disabled:opacity-50"
                            >
                              {deletingEntityId === entity.id ? 'Deleting...' : 'Reject'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          </div>
        </>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Deletion</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to reject and permanently delete this entity? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
              >
                Confirm & Delete
              </button>
            </div>
          </div>
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

