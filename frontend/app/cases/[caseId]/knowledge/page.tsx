'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { apiClient } from '@/lib/api'

interface Pattern {
  type: string
  description: string
  confidence: number
  [key: string]: any
}

export default function KnowledgeBasePage() {
  const params = useParams()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Pattern detection state
  const [patterns, setPatterns] = useState<any>(null)
  const [inconsistencies, setInconsistencies] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loadingPatterns, setLoadingPatterns] = useState(false)
  
  // RAG query state
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<any[]>([])
  const [loadingQuery, setLoadingQuery] = useState(false)
  
  // Summary state
  const [summary, setSummary] = useState('')
  const [summaryType, setSummaryType] = useState<'comprehensive' | 'timeline' | 'key_facts'>('comprehensive')
  const [loadingSummary, setLoadingSummary] = useState(false)
  
  // Active tab
  const [activeTab, setActiveTab] = useState<'patterns' | 'query' | 'summary'>('patterns')

  useEffect(() => {
    const initializeMatter = async () => {
      if (!caseIdParam) {
        setLoading(false)
        return
      }

      try {
        let matter
        try {
          matter = await apiClient.getMatter(caseIdParam)
        } catch (error) {
          matter = await apiClient.createMatter(
            caseIdParam,
            `Case ${caseIdParam}`
          )
        }
        setCaseId(matter.id)
        loadPatternSummary()
      } catch (error) {
        console.error('Error initializing matter:', error)
        setLoading(false)
      }
    }

    initializeMatter()
  }, [caseIdParam])

  const loadPatternSummary = async () => {
    if (!caseId) return
    
    try {
      setLoadingPatterns(true)
      const summary = await apiClient.getMatterPatternSummary(caseId)
      setPatterns(summary.rico_patterns)
      setInconsistencies(summary.inconsistencies)
      setSuggestions(summary.suggestions)
    } catch (error) {
      console.error('Error loading patterns:', error)
    } finally {
      setLoadingPatterns(false)
      setLoading(false)
    }
  }

  const handleQuery = async () => {
    if (!question.trim() || !caseId) return
    
    try {
      setLoadingQuery(true)
      const result = await apiClient.ragQueryEnhanced(question, caseId, true)
      setAnswer(result.answer)
      setCitations(result.citations || [])
    } catch (error) {
      console.error('Error querying:', error)
      setAnswer('Error: Could not process query. Please try again.')
    } finally {
      setLoadingQuery(false)
    }
  }

  const handleGenerateSummary = async () => {
    if (!caseId) return
    
    try {
      setLoadingSummary(true)
      const result = await apiClient.generateSummary(caseId, undefined, summaryType)
      setSummary(result.summary)
    } catch (error) {
      console.error('Error generating summary:', error)
      setSummary('Error: Could not generate summary. Please try again.')
    } finally {
      setLoadingSummary(false)
    }
  }

  if (loading && !caseId) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Knowledge Base</h1>
        <p className="text-gray-600">Pattern detection, AI-powered insights, and document analysis</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('patterns')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'patterns'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pattern Detection
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'query'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Ask Questions
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'summary'
                ? 'border-purple-500 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Generate Summary
          </button>
        </nav>
      </div>

      {/* Pattern Detection Tab */}
      {activeTab === 'patterns' && (
        <div className="space-y-6">
          {loadingPatterns ? (
            <div className="text-center py-12 text-gray-500">Analyzing patterns...</div>
          ) : (
            <>
              {/* Recurring Actors */}
              {patterns?.recurring_actors && patterns.recurring_actors.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Recurring Actors ({patterns.recurring_actors.length})
                  </h2>
                  <div className="space-y-4">
                    {patterns.recurring_actors.slice(0, 5).map((pattern: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-purple-500 pl-4 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {pattern.entity?.name || 'Unknown Entity'}
                            </p>
                            <p className="text-sm text-gray-600">{pattern.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Appears in {pattern.document_count} documents
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-purple-600">
                              {(pattern.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timing Sequences */}
              {patterns?.timing_sequences && patterns.timing_sequences.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Timing Sequences ({patterns.timing_sequences.length})
                  </h2>
                  <div className="space-y-4">
                    {patterns.timing_sequences.slice(0, 5).map((pattern: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {pattern.entities?.join(', ') || 'Multiple entities'}
                            </p>
                            <p className="text-sm text-gray-600">{pattern.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {pattern.event1?.name} → {pattern.event2?.name} ({pattern.days_between} days)
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-blue-600">
                              {(pattern.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coordinated Actions */}
              {patterns?.coordinated_actions && patterns.coordinated_actions.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Coordinated Actions ({patterns.coordinated_actions.length})
                  </h2>
                  <div className="space-y-4">
                    {patterns.coordinated_actions.slice(0, 5).map((pattern: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-green-500 pl-4 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {pattern.action_type?.replace('_', ' ').toUpperCase()}
                            </p>
                            <p className="text-sm text-gray-600">{pattern.description}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Entities: {pattern.entities?.map((e: any) => e.name).join(', ')}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-medium text-green-600">
                              {(pattern.confidence * 100).toFixed(0)}% confidence
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inconsistencies */}
              {inconsistencies.length > 0 && (
                <div className="bg-white rounded-lg border border-red-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Inconsistencies ({inconsistencies.length})
                  </h2>
                  <div className="space-y-4">
                    {inconsistencies.slice(0, 5).map((inc: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-red-500 pl-4 py-2">
                        <p className="font-medium text-gray-900">{inc.type?.replace('_', ' ')}</p>
                        <p className="text-sm text-gray-600">{inc.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* AI Suggestions */}
              {suggestions.length > 0 && (
                <div className="bg-white rounded-lg border border-purple-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    AI Suggestions ({suggestions.length})
                  </h2>
                  <div className="space-y-4">
                    {suggestions.map((suggestion: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-purple-500 pl-4 py-2">
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">
                          {suggestion.suggestion}
                        </p>
                        <p className="text-xs text-gray-500 mt-2">
                          Confidence: {(suggestion.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!patterns && inconsistencies.length === 0 && suggestions.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <p>No patterns detected yet.</p>
                  <p className="text-sm mt-2">Upload and process more documents to detect patterns.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Query Tab */}
      {activeTab === 'query' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Ask Questions</h2>
            <div className="space-y-4">
              <div>
                <textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question about the case documents..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      handleQuery()
                    }
                  }}
                />
              </div>
              <button
                onClick={handleQuery}
                disabled={loadingQuery || !question.trim()}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingQuery ? 'Processing...' : 'Ask Question (Ctrl+Enter)'}
              </button>
            </div>
          </div>

          {answer && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Answer</h2>
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap">{answer}</p>
              </div>
              
              {citations.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Sources</h3>
                  <div className="space-y-2">
                    {citations.map((citation: any, idx: number) => (
                      <div key={idx} className="text-sm text-gray-600">
                        <span className="font-medium">[{idx + 1}]</span> {citation.document_title || citation.file_name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Generate Summary</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Summary Type
                </label>
                <select
                  value={summaryType}
                  onChange={(e) => setSummaryType(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="comprehensive">Comprehensive Summary</option>
                  <option value="timeline">Timeline Summary</option>
                  <option value="key_facts">Key Facts Summary</option>
                </select>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={loadingSummary}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingSummary ? 'Generating...' : 'Generate Summary'}
              </button>
            </div>
          </div>

          {summary && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Summary</h2>
              <div className="prose max-w-none">
                <p className="text-gray-700 whitespace-pre-wrap">{summary}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

