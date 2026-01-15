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
  const [activeTab, setActiveTab] = useState<'patterns' | 'search' | 'query' | 'summary'>('patterns')
  
  // Search state (for document search)
  const [searchTerm, setSearchTerm] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchDocumentType, setSearchDocumentType] = useState<string>('')
  const [searchError, setSearchError] = useState<string>('')
  
  // Filter state
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    datePreset: 'all' as 'all' | '30d' | '3m' | '1y' | '5y' | 'custom',
    documentTypes: [] as string[],
    minConfidence: 0.0,
    entityIds: [] as string[]
  })
  const [showFilters, setShowFilters] = useState(false)
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([])

  const loadPatternSummary = async () => {
    if (!caseId) return
    
    try {
      setLoadingPatterns(true)
      
      // Apply date preset
      let startDate = filters.startDate
      let endDate = filters.endDate
      
      if (filters.datePreset !== 'custom' && filters.datePreset !== 'all') {
        const today = new Date()
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
        let start = new Date()
        
        switch (filters.datePreset) {
          case '30d':
            start.setDate(start.getDate() - 30)
            break
          case '3m':
            start.setMonth(start.getMonth() - 3)
            break
          case '1y':
            start.setFullYear(start.getFullYear() - 1)
            break
          case '5y':
            start.setFullYear(start.getFullYear() - 5)
            break
        }
        
        startDate = start.toISOString().split('T')[0]
        endDate = end.toISOString().split('T')[0]
      }
      
      const summary = await apiClient.getMatterPatternSummary(
        caseId,
        filters.datePreset === 'all' ? undefined : startDate,
        filters.datePreset === 'all' ? undefined : endDate,
        filters.documentTypes.length > 0 ? filters.documentTypes : undefined,
        filters.minConfidence > 0 ? filters.minConfidence : undefined
      )
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
      } catch (error) {
        console.error('Error initializing matter:', error)
        setLoading(false)
      }
    }

    initializeMatter()
  }, [caseIdParam])
  
  // Load available document types
  useEffect(() => {
    const loadDocumentTypes = async () => {
      if (!caseId) return
      try {
        const documents = await apiClient.getDocumentsByMatter(caseId)
        const types = Array.from(new Set(documents.map(d => d.document_type).filter(Boolean)))
        setAvailableDocumentTypes(types as string[])
      } catch (error) {
        console.error('Error loading document types:', error)
      }
    }
    if (caseId) {
      loadDocumentTypes()
    }
  }, [caseId])
  
  // Reload when filters change
  useEffect(() => {
    if (caseId && activeTab === 'patterns') {
      loadPatternSummary()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.datePreset, filters.startDate, filters.endDate, filters.documentTypes, filters.minConfidence, caseId, activeTab])
  
  const handleDatePresetChange = (preset: 'all' | '30d' | '3m' | '1y' | '5y' | 'custom') => {
    setFilters(prev => ({
      ...prev,
      datePreset: preset,
      startDate: preset === 'custom' ? prev.startDate : '',
      endDate: preset === 'custom' ? prev.endDate : ''
    }))
  }
  
  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      datePreset: 'all',
      documentTypes: [],
      minConfidence: 0.0,
      entityIds: []
    })
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

  const handleSearch = async () => {
    if (!caseId) return
    
    try {
      setLoadingSearch(true)
      setSearchError('')
      const documents = await apiClient.getDocumentsByMatter(
        caseId,
        searchTerm.trim() || undefined,
        searchDocumentType || undefined
      )
      setSearchResults(documents)
    } catch (error: any) {
      console.error('Error searching documents:', error)
      setSearchResults([])
      setSearchError(error?.message || 'Error searching documents')
    } finally {
      setLoadingSearch(false)
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
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pattern Detection
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'search'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Search Documents
          </button>
          <button
            onClick={() => setActiveTab('query')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'query'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Ask Questions
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'summary'
                ? 'border-primary-500 text-primary-600'
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
          {/* Filters Panel */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearFilters}
                  className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Clear All
                </button>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="text-sm text-primary-600 hover:text-primary-700 px-3 py-1 border border-primary-200 rounded hover:bg-primary-50"
                >
                  {showFilters ? '▼ Hide' : '▶ Show'} Filters
                </button>
              </div>
            </div>
            
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200">
                {/* Date Range Preset */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Time Period
                  </label>
                  <select
                    value={filters.datePreset}
                    onChange={(e) => handleDatePresetChange(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="all">All Time</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="3m">Last 3 Months</option>
                    <option value="1y">Last Year</option>
                    <option value="5y">Last 5 Years</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {/* Custom Date Range */}
                {filters.datePreset === 'custom' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </>
                )}
                
                {/* Document Types */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document Types
                  </label>
                  <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-lg p-2">
                    {availableDocumentTypes.length === 0 ? (
                      <p className="text-xs text-gray-500">No document types available</p>
                    ) : (
                      availableDocumentTypes.map((type) => (
                        <label key={type} className="flex items-center gap-2 py-1">
                          <input
                            type="checkbox"
                            checked={filters.documentTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters(prev => ({
                                  ...prev,
                                  documentTypes: [...prev.documentTypes, type]
                                }))
                              } else {
                                setFilters(prev => ({
                                  ...prev,
                                  documentTypes: prev.documentTypes.filter(t => t !== type)
                                }))
                              }
                            }}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 capitalize">{type.replace('_', ' ')}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
                
                {/* Confidence Score */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Min Confidence: {(filters.minConfidence * 100).toFixed(0)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={filters.minConfidence}
                    onChange={(e) => setFilters(prev => ({ ...prev, minConfidence: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Active Filters Summary */}
            {(filters.datePreset !== 'all' || filters.documentTypes.length > 0 || filters.minConfidence > 0) && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-600 mb-2">Active Filters:</p>
                <div className="flex flex-wrap gap-2">
                  {filters.datePreset !== 'all' && (
                    <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs">
                      {filters.datePreset === 'custom' 
                        ? `Custom: ${filters.startDate} to ${filters.endDate}`
                        : filters.datePreset === '30d' ? 'Last 30 Days'
                        : filters.datePreset === '3m' ? 'Last 3 Months'
                        : filters.datePreset === '1y' ? 'Last Year'
                        : 'Last 5 Years'}
                    </span>
                  )}
                  {filters.documentTypes.map(type => (
                    <span key={type} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                      {type.replace('_', ' ')}
                    </span>
                  ))}
                  {filters.minConfidence > 0 && (
                    <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                      Min Confidence: {(filters.minConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
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
                      <div key={idx} className="border-l-4 border-primary-500 pl-4 py-2">
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
                            <span className="text-sm font-medium text-primary-600">
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
                <div className="bg-white rounded-lg border border-primary-200 shadow-sm p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    AI Suggestions ({suggestions.length})
                  </h2>
                  <div className="space-y-4">
                    {suggestions.map((suggestion: any, idx: number) => (
                      <div key={idx} className="border-l-4 border-primary-500 pl-4 py-2">
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

      {/* Search Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Search Documents</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Documents
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by document name or title..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch()
                    }
                  }}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Document Type (Optional)
                </label>
                <select
                  value={searchDocumentType}
                  onChange={(e) => setSearchDocumentType(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All Types</option>
                  {availableDocumentTypes.map((type) => (
                    <option key={type} value={type}>
                      {type.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              
              <button
                onClick={handleSearch}
                disabled={loadingSearch}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingSearch ? 'Searching...' : 'Search Documents (Enter)'}
              </button>
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Search Results ({searchResults.length})
              </h2>
              <div className="space-y-3">
                {searchResults.map((doc) => {
                  // Highlight search term in text
                  const highlightText = (text: string, term: string) => {
                    if (!term) return text
                    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    const regex = new RegExp(`(${escapedTerm})`, 'gi')
                    const parts = text.split(regex)
                    return parts.map((part, i) => {
                      const testRegex = new RegExp(`^${escapedTerm}$`, 'i')
                      return testRegex.test(part) ? (
                        <mark key={i} className="bg-yellow-200 text-yellow-900 px-0.5 rounded">
                          {part}
                        </mark>
                      ) : part
                    })
                  }

                  return (
                    <div key={doc.id} className="border-l-4 border-primary-500 pl-4 py-3 bg-gray-50 rounded-r-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">
                            {doc.title || doc.file_name || 'Untitled Document'}
                          </h3>
                          <div className="flex items-center gap-2 mt-2">
                            {doc.document_type && (
                              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                                {doc.document_type.replace('_', ' ')}
                              </span>
                            )}
                            {doc.facts_count > 0 && (
                              <span className="text-xs text-gray-500">
                                {doc.facts_count} {doc.facts_count === 1 ? 'fact' : 'facts'}
                              </span>
                            )}
                            {doc.entities_count > 0 && (
                              <span className="text-xs text-gray-500">
                                {doc.entities_count} {doc.entities_count === 1 ? 'entity' : 'entities'}
                              </span>
                            )}
                          </div>
                          {doc.file_name && doc.file_name !== doc.title && (
                            <p className="text-xs text-gray-500 mt-1">File: {doc.file_name}</p>
                          )}
                          
                          {/* Context snippets with highlighted keywords */}
                          {doc.context_snippets && doc.context_snippets.length > 0 && (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-medium text-gray-700">Relevant excerpts:</p>
                              {doc.context_snippets.map((snippet: string, idx: number) => (
                                <div key={idx} className="text-sm text-gray-700 bg-white p-2 rounded border border-gray-200">
                                  <span className="text-gray-500">...</span>
                                  {highlightText(snippet, searchTerm)}
                                  <span className="text-gray-500">...</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => window.open(`/cases/${caseId}/documents/${doc.id}/review`, '_blank')}
                          className="ml-4 px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                        >
                          View →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {searchError && (
            <div className="bg-red-50 border border-red-200 rounded-lg shadow-sm p-6 text-center">
              <p className="text-red-800 font-medium">Error: {searchError}</p>
            </div>
          )}

          {!loadingSearch && !searchError && (searchTerm || searchDocumentType) && searchResults.length === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-center">
              <p className="text-gray-600">No documents found</p>
              <p className="text-sm text-gray-500 mt-2">
                {searchTerm ? `No documents match "${searchTerm}"` : 'Try adjusting your filters.'}
              </p>
            </div>
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px]"
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
                className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="comprehensive">Comprehensive Summary</option>
                  <option value="timeline">Timeline Summary</option>
                  <option value="key_facts">Key Facts Summary</option>
                </select>
              </div>
              <button
                onClick={handleGenerateSummary}
                disabled={loadingSummary}
                className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

