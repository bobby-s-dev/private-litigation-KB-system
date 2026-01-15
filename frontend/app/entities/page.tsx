'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Folder, Users, FileText, ChevronDown, ChevronRight, Loader2, Mail, User } from 'lucide-react'
import { apiClient, Matter } from '@/lib/api'

interface Entity {
  id: string
  name: string
  type: string
  '@name': string
  short_name: string
  email: string
  role: string
  review_status: string
  related_facts_count: number
  attributes?: any
}

interface CaseWithEntities {
  case: Matter
  entities: Entity[]
  total: number
  loading: boolean
}

export default function EntitiesPage() {
  const router = useRouter()
  const [cases, setCases] = useState<Matter[]>([])
  const [casesWithEntities, setCasesWithEntities] = useState<Map<string, CaseWithEntities>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [caseFilter, setCaseFilter] = useState<string>('all')
  const [availableTypes, setAvailableTypes] = useState<string[]>([])
  const [loadingEntities, setLoadingEntities] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadCases()
  }, [])

  useEffect(() => {
    // Load entities for expanded cases
    expandedCases.forEach(caseId => {
      if (!casesWithEntities.has(caseId)) {
        loadEntitiesForCase(caseId)
      }
    })
  }, [expandedCases])

  const loadCases = async () => {
    try {
      setLoading(true)
      const matters = await apiClient.listMatters()
      setCases(matters)
    } catch (error) {
      console.error('Error loading cases:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadEntitiesForCase = async (caseId: string) => {
    if (loadingEntities.has(caseId)) return

    try {
      setLoadingEntities(prev => new Set(prev).add(caseId))
      
      const response = await apiClient.getMatterEntities(
        caseId,
        undefined, // search
        undefined, // entityType
        undefined, // reviewStatus
        1000, // large limit to get all entities
        0 // offset
      )

      const caseData = cases.find(c => c.id === caseId)
      if (caseData) {
        setCasesWithEntities(prev => {
          const newMap = new Map(prev)
          newMap.set(caseId, {
            case: caseData,
            entities: response.entities,
            total: response.total,
            loading: false
          })
          return newMap
        })

        // Collect all entity types for filter
        const types = new Set<string>()
        response.entities.forEach((entity: Entity) => {
          if (entity.type) types.add(entity.type)
        })
        setAvailableTypes(prev => Array.from(new Set([...prev, ...Array.from(types)])))
      }
    } catch (error) {
      console.error(`Error loading entities for case ${caseId}:`, error)
      setCasesWithEntities(prev => {
        const newMap = new Map(prev)
        const existing = newMap.get(caseId)
        if (existing) {
          newMap.set(caseId, { ...existing, loading: false })
        }
        return newMap
      })
    } finally {
      setLoadingEntities(prev => {
        const newSet = new Set(prev)
        newSet.delete(caseId)
        return newSet
      })
    }
  }

  const toggleCase = (caseId: string) => {
    setExpandedCases(prev => {
      const newSet = new Set(prev)
      if (newSet.has(caseId)) {
        newSet.delete(caseId)
      } else {
        newSet.add(caseId)
      }
      return newSet
    })
  }

  const filterEntities = (entities: Entity[]): Entity[] => {
    return entities.filter(entity => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch = 
          entity.name.toLowerCase().includes(query) ||
          entity.type.toLowerCase().includes(query) ||
          (entity.email && entity.email.toLowerCase().includes(query)) ||
          (entity.role && entity.role.toLowerCase().includes(query))
        if (!matchesSearch) return false
      }

      // Type filter
      if (typeFilter !== 'all' && entity.type !== typeFilter) {
        return false
      }

      // Review status filter
      if (reviewStatusFilter !== 'all' && entity.review_status !== reviewStatusFilter) {
        return false
      }

      return true
    })
  }

  const getFilteredCases = () => {
    if (caseFilter === 'all') {
      return Array.from(casesWithEntities.values())
    }
    return Array.from(casesWithEntities.values()).filter(cwe => cwe.case.id === caseFilter)
  }

  const getTotalEntities = () => {
    return Array.from(casesWithEntities.values()).reduce((sum, cwe) => sum + cwe.total, 0)
  }

  const getFilteredTotal = () => {
    return getFilteredCases().reduce((sum, cwe) => sum + filterEntities(cwe.entities).length, 0)
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-gray-600 flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading cases...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">All Entities</h1>
        <p className="text-gray-600">View entities across all cases</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Cases</p>
              <p className="text-2xl font-bold text-primary-600 mt-1">{cases.length}</p>
            </div>
            <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
              <Folder className="h-6 w-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Entities</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{getTotalEntities()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Filtered Entities</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{getFilteredTotal()}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Filter className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search Box */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* Case Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Case:</label>
            <select
              value={caseFilter}
              onChange={(e) => setCaseFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Cases</option>
              {cases.map((caseItem) => (
                <option key={caseItem.id} value={caseItem.id}>
                  {caseItem.matter_name || caseItem.matter_number}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Types</option>
              {availableTypes.sort().map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Review Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={reviewStatusFilter}
              onChange={(e) => setReviewStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              <option value="accepted">Accepted</option>
              <option value="not_reviewed">Not Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Cases List */}
      <div className="space-y-4">
        {cases.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-600">No cases found. Create a case to start extracting entities.</p>
          </div>
        ) : (
          cases.map((caseItem) => {
            const caseData = casesWithEntities.get(caseItem.id)
            const isExpanded = expandedCases.has(caseItem.id)
            const isLoading = loadingEntities.has(caseItem.id)
            const filteredEntities = caseData ? filterEntities(caseData.entities) : []

            // Skip if case filter is set and doesn't match
            if (caseFilter !== 'all' && caseFilter !== caseItem.id) {
              return null
            }

            return (
              <div key={caseItem.id} className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
                {/* Case Header */}
                <button
                  onClick={() => toggleCase(caseItem.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 flex-1">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                    <Folder className="h-5 w-5 text-primary-600" />
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {caseItem.matter_name || caseItem.matter_number}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {caseItem.matter_number} • {caseData ? `${caseData.total} entities` : 'Click to load entities'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      router.push(`/cases/${caseItem.id}/entities`)
                    }}
                    className="px-4 py-2 text-sm text-primary-600 hover:bg-primary-50 rounded-lg font-medium transition-colors"
                  >
                    View Case Entities
                  </button>
                </button>

                {/* Entities List */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    {isLoading ? (
                      <div className="p-8 text-center">
                        <Loader2 className="h-6 w-6 animate-spin text-primary-600 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Loading entities...</p>
                      </div>
                    ) : caseData && caseData.entities.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <p className="text-sm">No entities found in this case.</p>
                      </div>
                    ) : caseData && filteredEntities.length === 0 ? (
                      <div className="p-8 text-center text-gray-500">
                        <p className="text-sm">No entities match the current filters.</p>
                      </div>
                    ) : caseData ? (
                      <div className="p-4">
                        <div className="mb-3 text-sm text-gray-600">
                          Showing {filteredEntities.length} of {caseData.total} entities
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredEntities.map((entity) => (
                            <div
                              key={entity.id}
                              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <h4 className="font-medium text-gray-900 mb-1">{entity.name}</h4>
                                  <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                    {entity.type}
                                  </span>
                                </div>
                                <span
                                  className={`px-2 py-1 rounded text-xs font-medium ${
                                    entity.review_status === 'accepted'
                                      ? 'bg-green-100 text-green-700'
                                      : entity.review_status === 'rejected'
                                      ? 'bg-red-100 text-red-700'
                                      : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {entity.review_status === 'accepted' ? 'Accepted' : entity.review_status === 'rejected' ? 'Rejected' : 'Not Reviewed'}
                                </span>
                              </div>
                              {entity.email && (
                                <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {entity.email}
                                </p>
                              )}
                              {entity.role && (
                                <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  {entity.role}
                                </p>
                              )}
                              <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-2">
                                <FileText className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-500">
                                  {entity.related_facts_count} fact{entity.related_facts_count !== 1 ? 's' : ''}
                                </span>
                                <button
                                  onClick={() => router.push(`/cases/${caseItem.id}/facts?entity=${encodeURIComponent(entity.name)}`)}
                                  className="ml-auto text-xs text-primary-600 hover:text-primary-700 font-medium"
                                >
                                  View Facts →
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

