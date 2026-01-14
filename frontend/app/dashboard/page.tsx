'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Filter,
  FileText,
  Calendar,
  Users,
  Folder,
  Tag,
  Copy,
  TrendingUp,
  Shield,
  Clock,
  Scale,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Grid3x3,
  List
} from 'lucide-react'
import { apiClient, Document, Matter } from '@/lib/api'

interface FilterState {
  // Document Type Filters
  documentTypes: string[]
  
  // Date Filters
  dateRange: {
    start: string
    end: string
  }
  datePreset: 'all' | '7d' | '30d' | '3m' | '6m' | '1y' | 'custom'
  
  // Party/Entity Filters
  entityIds: string[]
  entityTypes: string[]
  
  // Case/Matter Filters
  matterIds: string[]
  
  // Keyword/Topic Filters
  keywords: string[]
  topics: string[]
  searchQuery: string
  
  // Duplicate & Versioning Filters
  showDuplicates: boolean
  showVersions: boolean
  duplicateType: 'all' | 'exact' | 'near' | null
  
  // Sentiment & Tone Filters
  sentiment: 'all' | 'positive' | 'neutral' | 'negative'
  tone: string[]
  
  // RICO & Pattern Filters
  showRicoPatterns: boolean
  minConfidence: number
  patternTypes: string[]
  
  // Privacy & Confidentiality Filters
  privacyLevel: 'all' | 'public' | 'confidential' | 'restricted'
  showSensitiveOnly: boolean
  
  // Time-Based Filters
  timeRange: {
    start: string
    end: string
  }
  extractDates: boolean
  
  // Custom Legal Concept Filters
  legalConcepts: string[]
  showFraud: boolean
  showCoordinatedActions: boolean
}

type FilterTab = 'all' | 'documentType' | 'date' | 'entity' | 'matter' | 'keyword' | 'duplicate' | 'sentiment' | 'rico' | 'privacy' | 'time' | 'legal'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [matters, setMatters] = useState<Matter[]>([])
  const [totalDocuments, setTotalDocuments] = useState(0)
  const [filteredCount, setFilteredCount] = useState(0)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    documentTypes: [],
    dateRange: { start: '', end: '' },
    datePreset: 'all',
    entityIds: [],
    entityTypes: [],
    matterIds: [],
    keywords: [],
    topics: [],
    searchQuery: '',
    showDuplicates: false,
    showVersions: false,
    duplicateType: null,
    sentiment: 'all',
    tone: [],
    showRicoPatterns: false,
    minConfidence: 0.0,
    patternTypes: [],
    privacyLevel: 'all',
    showSensitiveOnly: false,
    timeRange: { start: '', end: '' },
    extractDates: false,
    legalConcepts: [],
    showFraud: false,
    showCoordinatedActions: false,
  })
  
  // UI state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [availableDocumentTypes, setAvailableDocumentTypes] = useState<string[]>([])
  const [availableEntities, setAvailableEntities] = useState<any[]>([])
  const [availableEntityTypes, setAvailableEntityTypes] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [allFilteredDocuments, setAllFilteredDocuments] = useState<Document[]>([])
  
  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [])
  
  // Update displayed documents when page changes
  useEffect(() => {
    if (allFilteredDocuments.length > 0) {
      const startIndex = (currentPage - 1) * pageSize
      const paginated = allFilteredDocuments.slice(startIndex, startIndex + pageSize)
      setDocuments(paginated)
      setFilteredCount(allFilteredDocuments.length)
    }
  }, [currentPage, pageSize, allFilteredDocuments])
  
  const loadInitialData = async () => {
    try {
      setLoading(true)
      const [mattersData, documentsData] = await Promise.all([
        apiClient.listMatters(),
        loadDocumentsData()
      ])
      setMatters(mattersData)
      setTotalDocuments(documentsData.length)
      
      // Extract unique document types
      const types = new Set<string>()
      documentsData.forEach((doc: Document) => {
        if (doc.document_type) types.add(doc.document_type)
      })
      setAvailableDocumentTypes(Array.from(types).sort())
      
      // Load entities for entity filters
      await loadEntities()
    } catch (error) {
      console.error('Error loading initial data:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const loadDocumentsData = async (): Promise<Document[]> => {
    try {
      const params = new URLSearchParams()
      params.append('limit', '10000') // Get all for filtering
      params.append('offset', '0')
      
      if (filters.matterIds.length > 0) {
        filters.matterIds.forEach(id => params.append('matter_id', id))
      }
      if (filters.documentTypes.length > 0) {
        filters.documentTypes.forEach(type => params.append('document_type', type))
      }
      if (filters.searchQuery) {
        params.append('search', filters.searchQuery)
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/documents?${params.toString()}`)
      if (response.ok) {
        const data = await response.json()
        return data.documents || []
      }
    } catch (error) {
      console.error('Error loading documents:', error)
    }
    return []
  }
  
  const performSearch = async () => {
    try {
      setSearching(true)
      const allDocs = await loadDocumentsData()
      
      // Apply client-side filters based on active tab
      let filtered = allDocs.filter(doc => {
        // Apply filters based on active tab
        switch (activeTab) {
          case 'documentType':
            if (filters.documentTypes.length > 0 && !filters.documentTypes.includes(doc.document_type || '')) {
              return false
            }
            break
          
          case 'date':
            if (filters.datePreset !== 'all') {
              const docDate = doc.ingested_at || doc.created_at
              if (docDate) {
                const docDateObj = new Date(docDate)
                const start = filters.dateRange.start ? new Date(filters.dateRange.start) : null
                const end = filters.dateRange.end ? new Date(filters.dateRange.end) : null
                
                if (start && docDateObj < start) return false
                if (end && docDateObj > end) return false
              }
            }
            break
          
          case 'entity':
            // Entity filtering would require checking document-entity relationships
            // This is a simplified version
            break
          
          case 'matter':
            // Already handled in API call
            break
          
          case 'keyword':
            if (filters.keywords.length > 0) {
              const docText = `${doc.filename} ${doc.document_type} ${doc.file_name || ''}`.toLowerCase()
              const matchesKeyword = filters.keywords.some(keyword =>
                docText.includes(keyword.toLowerCase())
              )
              if (!matchesKeyword) return false
            }
            break
          
          case 'duplicate':
            // Duplicate filtering would require checking duplicate relationships
            // This is a simplified version
            break
          
          default:
            // Apply all filters for 'all' tab
            if (filters.documentTypes.length > 0 && !filters.documentTypes.includes(doc.document_type || '')) {
              return false
            }
            if (filters.datePreset !== 'all') {
              const docDate = doc.ingested_at || doc.created_at
              if (docDate) {
                const docDateObj = new Date(docDate)
                const start = filters.dateRange.start ? new Date(filters.dateRange.start) : null
                const end = filters.dateRange.end ? new Date(filters.dateRange.end) : null
                
                if (start && docDateObj < start) return false
                if (end && docDateObj > end) return false
              }
            }
            if (filters.keywords.length > 0) {
              const docText = `${doc.filename} ${doc.document_type} ${doc.file_name || ''}`.toLowerCase()
              const matchesKeyword = filters.keywords.some(keyword =>
                docText.includes(keyword.toLowerCase())
              )
              if (!matchesKeyword) return false
            }
            break
        }
        
        return true
      })
      
      setAllFilteredDocuments(filtered)
      setCurrentPage(1) // Reset to first page after search
    } catch (error) {
      console.error('Error performing search:', error)
    } finally {
      setSearching(false)
    }
  }
  
  const loadEntities = async () => {
    try {
      const entities: any[] = []
      const entityTypesSet = new Set<string>()
      
      for (const matter of matters) {
        try {
          const response = await apiClient.getMatterEntities(matter.id, undefined, undefined, undefined, 1000, 0)
          response.entities.forEach((entity: any) => {
            entities.push({ ...entity, matterId: matter.id, matterName: matter.matter_name })
            if (entity.type) entityTypesSet.add(entity.type)
          })
        } catch (error) {
          console.error(`Error loading entities for matter ${matter.id}:`, error)
        }
      }
      
      setAvailableEntities(entities)
      setAvailableEntityTypes(Array.from(entityTypesSet).sort())
    } catch (error) {
      console.error('Error loading entities:', error)
    }
  }
  
  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev)
      if (newSet.has(section)) {
        newSet.delete(section)
      } else {
        newSet.add(section)
      }
      return newSet
    })
  }
  
  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }
  
  const addArrayFilter = <K extends keyof FilterState>(key: K, value: string) => {
    setFilters(prev => {
      const current = prev[key] as string[]
      if (!current.includes(value)) {
        return { ...prev, [key]: [...current, value] as FilterState[K] }
      }
      return prev
    })
  }
  
  const removeArrayFilter = <K extends keyof FilterState>(key: K, value: string) => {
    setFilters(prev => {
      const current = prev[key] as string[]
      return { ...prev, [key]: current.filter(v => v !== value) as FilterState[K] }
    })
  }
  
  const applyDatePreset = (preset: FilterState['datePreset']) => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    let start = new Date()
    
    switch (preset) {
      case '7d':
        start.setDate(start.getDate() - 7)
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        break
      case '3m':
        start.setMonth(start.getMonth() - 3)
        break
      case '6m':
        start.setMonth(start.getMonth() - 6)
        break
      case '1y':
        start.setFullYear(start.getFullYear() - 1)
        break
      case 'custom':
        return
      default:
        updateFilter('dateRange', { start: '', end: '' })
        updateFilter('datePreset', 'all')
        return
    }
    
    start.setHours(0, 0, 0, 0)
    updateFilter('dateRange', {
      start: start.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    })
    updateFilter('datePreset', preset)
  }
  
  const clearAllFilters = () => {
    setFilters({
      documentTypes: [],
      dateRange: { start: '', end: '' },
      datePreset: 'all',
      entityIds: [],
      entityTypes: [],
      matterIds: [],
      keywords: [],
      topics: [],
      searchQuery: '',
      showDuplicates: false,
      showVersions: false,
      duplicateType: null,
      sentiment: 'all',
      tone: [],
      showRicoPatterns: false,
      minConfidence: 0.0,
      patternTypes: [],
      privacyLevel: 'all',
      showSensitiveOnly: false,
      timeRange: { start: '', end: '' },
      extractDates: false,
      legalConcepts: [],
      showFraud: false,
      showCoordinatedActions: false,
    })
    setDocuments([])
    setAllFilteredDocuments([])
    setFilteredCount(0)
    setCurrentPage(1)
  }
  
  const getActiveFiltersCount = () => {
    let count = 0
    if (filters.documentTypes.length > 0) count++
    if (filters.datePreset !== 'all') count++
    if (filters.entityIds.length > 0) count++
    if (filters.entityTypes.length > 0) count++
    if (filters.matterIds.length > 0) count++
    if (filters.keywords.length > 0) count++
    if (filters.topics.length > 0) count++
    if (filters.searchQuery) count++
    if (filters.showDuplicates) count++
    if (filters.showVersions) count++
    if (filters.sentiment !== 'all') count++
    if (filters.showRicoPatterns) count++
    if (filters.privacyLevel !== 'all') count++
    if (filters.showSensitiveOnly) count++
    if (filters.legalConcepts.length > 0) count++
    if (filters.showFraud) count++
    if (filters.showCoordinatedActions) count++
    return count
  }
  
  const getTotalPages = () => {
    return Math.ceil(filteredCount / pageSize)
  }
  
  const getPageNumbers = () => {
    const totalPages = getTotalPages()
    const pages: (number | string)[] = []
    
    if (totalPages <= 7) {
      // Show all pages if 7 or fewer
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show first page
      pages.push(1)
      
      if (currentPage > 3) {
        pages.push('...')
      }
      
      // Show pages around current page
      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)
      
      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('...')
      }
      
      // Show last page
      pages.push(totalPages)
    }
    
    return pages
  }
  
  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading dashboard...
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Document Dashboard</h1>
        <p className="text-gray-600">Organize, analyze, and query your documents</p>
      </div>
      
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Documents</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">{totalDocuments}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Filtered Results</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{filteredCount}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Filter className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Active Filters</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{getActiveFiltersCount()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Cases</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">{matters.length}</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Folder className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Search Bar */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search documents by filename, content, or keywords..."
              value={filters.searchQuery}
              onChange={(e) => updateFilter('searchQuery', e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  performSearch()
                }
              }}
              className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          </div>
          <button
            onClick={performSearch}
            disabled={searching}
            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4" />
                Search
              </>
            )}
          </button>
          <button
            onClick={clearAllFilters}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>
      
      {/* Filters and Results Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left Column - Filters */}
        <div className="lg:col-span-1 space-y-4">
          {/* Filter Tabs */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-2 mb-4">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setActiveTab('documentType')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'documentType'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Type
              </button>
              <button
                onClick={() => setActiveTab('date')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'date'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Date
              </button>
              <button
                onClick={() => setActiveTab('entity')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'entity'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Entity
              </button>
              <button
                onClick={() => setActiveTab('matter')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'matter'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Case
              </button>
              <button
                onClick={() => setActiveTab('keyword')}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  activeTab === 'keyword'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Keyword
              </button>
            </div>
          </div>
          
          {/* Document Type Filters */}
          {(activeTab === 'all' || activeTab === 'documentType') && (
            <FilterSection
              title="Document Type Filters"
              icon={<FileText className="h-5 w-5" />}
              isExpanded={expandedSections.has('documentType')}
              onToggle={() => toggleSection('documentType')}
              onSearch={performSearch}
            >
              <div className="space-y-2">
                {availableDocumentTypes.map(type => (
                  <label key={type} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.documentTypes.includes(type)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          addArrayFilter('documentTypes', type)
                        } else {
                          removeArrayFilter('documentTypes', type)
                        }
                      }}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">{type}</span>
                  </label>
                ))}
                {availableDocumentTypes.length === 0 && (
                  <p className="text-sm text-gray-500">No document types available</p>
                )}
              </div>
            </FilterSection>
          )}
          
          {/* Date Filters */}
          {(activeTab === 'all' || activeTab === 'date') && (
            <FilterSection
              title="Date Filters"
              icon={<Calendar className="h-5 w-5" />}
              isExpanded={expandedSections.has('date')}
              onToggle={() => toggleSection('date')}
              onSearch={performSearch}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Quick Presets</label>
                  <select
                    value={filters.datePreset}
                    onChange={(e) => {
                      const preset = e.target.value as FilterState['datePreset']
                      applyDatePreset(preset)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                  >
                    <option value="all">All Time</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="3m">Last 3 Months</option>
                    <option value="6m">Last 6 Months</option>
                    <option value="1y">Last Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {(filters.datePreset === 'custom' || filters.datePreset !== 'all') && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Start Date</label>
                      <input
                        type="date"
                        value={filters.dateRange.start}
                        onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, start: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">End Date</label>
                      <input
                        type="date"
                        value={filters.dateRange.end}
                        onChange={(e) => updateFilter('dateRange', { ...filters.dateRange, end: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </FilterSection>
          )}
          
          {/* Party/Entity Filters */}
          {(activeTab === 'all' || activeTab === 'entity') && (
            <FilterSection
              title="Party/Entity Filters"
              icon={<Users className="h-5 w-5" />}
              isExpanded={expandedSections.has('entity')}
              onToggle={() => toggleSection('entity')}
              onSearch={performSearch}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Entity Types</label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {availableEntityTypes.map(type => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filters.entityTypes.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              addArrayFilter('entityTypes', type)
                            } else {
                              removeArrayFilter('entityTypes', type)
                            }
                          }}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <span className="text-sm text-gray-700">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Specific Entities</label>
                  <select
                    multiple
                    value={filters.entityIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      updateFilter('entityIds', selected)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    size={5}
                  >
                    {availableEntities.map(entity => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name} ({entity.type})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>
              </div>
            </FilterSection>
          )}
          
          {/* Case/Matter Filters */}
          {(activeTab === 'all' || activeTab === 'matter') && (
            <FilterSection
              title="Case/Matter Filters"
              icon={<Folder className="h-5 w-5" />}
              isExpanded={expandedSections.has('matter')}
              onToggle={() => toggleSection('matter')}
              onSearch={performSearch}
            >
              <div className="space-y-2">
                {matters.map(matter => (
                  <label key={matter.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.matterIds.includes(matter.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          addArrayFilter('matterIds', matter.id)
                        } else {
                          removeArrayFilter('matterIds', matter.id)
                        }
                      }}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700 flex-1">
                      {matter.matter_name || matter.matter_number}
                    </span>
                  </label>
                ))}
                {matters.length === 0 && (
                  <p className="text-sm text-gray-500">No cases available</p>
                )}
              </div>
            </FilterSection>
          )}
          
          {/* Keyword/Topic Filters */}
          {(activeTab === 'all' || activeTab === 'keyword') && (
            <FilterSection
              title="Keyword/Topic Filters"
              icon={<Tag className="h-5 w-5" />}
              isExpanded={expandedSections.has('keyword')}
              onToggle={() => toggleSection('keyword')}
              onSearch={performSearch}
            >
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Keywords</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add keyword..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          addArrayFilter('keywords', e.currentTarget.value.trim())
                          e.currentTarget.value = ''
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {filters.keywords.map(keyword => (
                      <span
                        key={keyword}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs"
                      >
                        {keyword}
                        <button
                          onClick={() => removeArrayFilter('keywords', keyword)}
                          className="hover:text-purple-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Legal Topics</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add topic..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          addArrayFilter('topics', e.currentTarget.value.trim())
                          e.currentTarget.value = ''
                        }
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {filters.topics.map(topic => (
                      <span
                        key={topic}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        {topic}
                        <button
                          onClick={() => removeArrayFilter('topics', topic)}
                          className="hover:text-blue-900"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </FilterSection>
          )}
          
          {/* Additional filter sections for 'all' tab */}
          {activeTab === 'all' && (
            <>
              {/* Duplicate & Versioning Filters */}
              <FilterSection
                title="Duplicate & Versioning"
                icon={<Copy className="h-5 w-5" />}
                isExpanded={expandedSections.has('duplicate')}
                onToggle={() => toggleSection('duplicate')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showDuplicates}
                      onChange={(e) => updateFilter('showDuplicates', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show Duplicates Only</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showVersions}
                      onChange={(e) => updateFilter('showVersions', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show All Versions</span>
                  </label>
                  
                  {filters.showDuplicates && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">Duplicate Type</label>
                      <select
                        value={filters.duplicateType || 'all'}
                        onChange={(e) => updateFilter('duplicateType', e.target.value === 'all' ? null : e.target.value as any)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      >
                        <option value="all">All Types</option>
                        <option value="exact">Exact Duplicates</option>
                        <option value="near">Near Duplicates</option>
                      </select>
                    </div>
                  )}
                </div>
              </FilterSection>
              
              {/* Sentiment & Tone Filters */}
              <FilterSection
                title="Sentiment & Tone"
                icon={<TrendingUp className="h-5 w-5" />}
                isExpanded={expandedSections.has('sentiment')}
                onToggle={() => toggleSection('sentiment')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Sentiment</label>
                    <select
                      value={filters.sentiment}
                      onChange={(e) => updateFilter('sentiment', e.target.value as FilterState['sentiment'])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                      <option value="all">All Sentiments</option>
                      <option value="positive">Positive</option>
                      <option value="neutral">Neutral</option>
                      <option value="negative">Negative</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Tone</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add tone (e.g., formal, urgent)..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            addArrayFilter('tone', e.currentTarget.value.trim())
                            e.currentTarget.value = ''
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {filters.tone.map(t => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs"
                        >
                          {t}
                          <button
                            onClick={() => removeArrayFilter('tone', t)}
                            className="hover:text-yellow-900"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </FilterSection>
              
              {/* RICO & Pattern Filters */}
              <FilterSection
                title="RICO & Pattern Filters"
                icon={<Scale className="h-5 w-5" />}
                isExpanded={expandedSections.has('rico')}
                onToggle={() => toggleSection('rico')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showRicoPatterns}
                      onChange={(e) => updateFilter('showRicoPatterns', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show RICO Patterns Only</span>
                  </label>
                  
                  {filters.showRicoPatterns && (
                    <>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">
                          Minimum Confidence: {filters.minConfidence.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={filters.minConfidence}
                          onChange={(e) => updateFilter('minConfidence', parseFloat(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-2 block">Pattern Types</label>
                        <div className="space-y-2">
                          {['recurring_actors', 'timing_sequences', 'coordinated_actions', 'financial_patterns', 'communication_patterns'].map(type => (
                            <label key={type} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={filters.patternTypes.includes(type)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    addArrayFilter('patternTypes', type)
                                  } else {
                                    removeArrayFilter('patternTypes', type)
                                  }
                                }}
                                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                              />
                              <span className="text-sm text-gray-700">{type.replace(/_/g, ' ')}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </FilterSection>
              
              {/* Privacy & Confidentiality Filters */}
              <FilterSection
                title="Privacy & Confidentiality"
                icon={<Shield className="h-5 w-5" />}
                isExpanded={expandedSections.has('privacy')}
                onToggle={() => toggleSection('privacy')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Privacy Level</label>
                    <select
                      value={filters.privacyLevel}
                      onChange={(e) => updateFilter('privacyLevel', e.target.value as FilterState['privacyLevel'])}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                    >
                      <option value="all">All Levels</option>
                      <option value="public">Public</option>
                      <option value="confidential">Confidential</option>
                      <option value="restricted">Restricted</option>
                    </select>
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showSensitiveOnly}
                      onChange={(e) => updateFilter('showSensitiveOnly', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show Sensitive Data Only</span>
                  </label>
                </div>
              </FilterSection>
              
              {/* Time-Based Filters */}
              <FilterSection
                title="Time-Based Filters"
                icon={<Clock className="h-5 w-5" />}
                isExpanded={expandedSections.has('time')}
                onToggle={() => toggleSection('time')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Event Time Range</label>
                    <div className="space-y-2">
                      <input
                        type="date"
                        placeholder="Start Date"
                        value={filters.timeRange.start}
                        onChange={(e) => updateFilter('timeRange', { ...filters.timeRange, start: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                      <input
                        type="date"
                        placeholder="End Date"
                        value={filters.timeRange.end}
                        onChange={(e) => updateFilter('timeRange', { ...filters.timeRange, end: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.extractDates}
                      onChange={(e) => updateFilter('extractDates', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Extract Date-Related Entities</span>
                  </label>
                </div>
              </FilterSection>
              
              {/* Custom Legal Concept Filters */}
              <FilterSection
                title="Custom Legal Concepts"
                icon={<Scale className="h-5 w-5" />}
                isExpanded={expandedSections.has('legal')}
                onToggle={() => toggleSection('legal')}
                onSearch={performSearch}
              >
                <div className="space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-2 block">Legal Concepts</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add concept (e.g., fraud, conspiracy)..."
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            addArrayFilter('legalConcepts', e.currentTarget.value.trim())
                            e.currentTarget.value = ''
                          }
                        }}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {filters.legalConcepts.map(concept => (
                        <span
                          key={concept}
                          className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs"
                        >
                          {concept}
                          <button
                            onClick={() => removeArrayFilter('legalConcepts', concept)}
                            className="hover:text-red-900"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showFraud}
                      onChange={(e) => updateFilter('showFraud', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show Fraud Indicators</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showCoordinatedActions}
                      onChange={(e) => updateFilter('showCoordinatedActions', e.target.checked)}
                      className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    <span className="text-sm text-gray-700">Show Coordinated Actions</span>
                  </label>
                </div>
              </FilterSection>
            </>
          )}
        </div>
        
        {/* Right Column - Results */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Documents ({filteredCount})
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="25">25 per page</option>
                  <option value="50">50 per page</option>
                  <option value="100">100 per page</option>
                </select>
              </div>
            </div>
            
            <div className="p-4">
              {documents.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">No documents found</p>
                  <p className="text-sm text-gray-500">
                    {getActiveFiltersCount() > 0
                      ? 'Try adjusting your filters and click Search'
                      : 'Set filters and click Search to find documents'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc) => (
                    <DocumentCard
                      key={doc.id}
                      document={doc}
                      onClick={() => {
                        const matterId = filters.matterIds[0] || matters[0]?.id
                        if (matterId) {
                          router.push(`/cases/${matterId}/knowledge`)
                        }
                      }}
                    />
                  ))}
                </div>
              )}
              
              {/* Pagination with Numbers */}
              {documents.length > 0 && getTotalPages() > 1 && (
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredCount)} of {filteredCount}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    <div className="flex items-center gap-1">
                      {getPageNumbers().map((page, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            if (typeof page === 'number') {
                              setCurrentPage(page)
                            }
                          }}
                          disabled={page === '...'}
                          className={`px-3 py-2 text-sm border border-gray-300 rounded-lg transition-colors ${
                            page === currentPage
                              ? 'bg-purple-600 text-white border-purple-600'
                              : page === '...'
                              ? 'border-transparent cursor-default'
                              : 'hover:bg-gray-50'
                          } disabled:cursor-default`}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(getTotalPages(), prev + 1))}
                      disabled={currentPage === getTotalPages()}
                      className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Filter Section Component
function FilterSection({
  title,
  icon,
  children,
  isExpanded,
  onToggle,
  onSearch,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  onSearch: () => void
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="text-purple-600">{icon}</div>
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        )}
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
          {children}
          <button
            onClick={onSearch}
            className="mt-4 w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
        </div>
      )}
    </div>
  )
}

// Document Card Component
function DocumentCard({ document, onClick }: { document: Document; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{document.filename || document.file_name}</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {document.document_type && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                {document.document_type}
              </span>
            )}
            {document.processing_status && (
              <span
                className={`px-2 py-1 rounded text-xs font-medium ${
                  document.processing_status === 'completed'
                    ? 'bg-green-100 text-green-700'
                    : document.processing_status === 'processing'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {document.processing_status}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4 text-sm text-gray-600 mt-3">
        {document.facts_count !== undefined && (
          <span className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            {document.facts_count} facts
          </span>
        )}
        {document.entities_count !== undefined && (
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            {document.entities_count} entities
          </span>
        )}
        {document.ingested_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(document.ingested_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  )
}
