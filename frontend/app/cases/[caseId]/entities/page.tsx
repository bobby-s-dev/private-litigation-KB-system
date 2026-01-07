'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

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

export default function EntitiesPage() {
  const params = useParams()
  const router = useRouter()
  const caseIdParam = params?.caseId as string
  const [caseId, setCaseId] = useState<string | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(50)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [editingEntity, setEditingEntity] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Entity>>({})
  const [availableTypes, setAvailableTypes] = useState<string[]>([])
  const [factsPerEntity, setFactsPerEntity] = useState<Array<{ name: string; value: number; color: string; type: string }>>([])
  const [loadingStats, setLoadingStats] = useState(true)

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

  useEffect(() => {
    if (caseId) {
      loadEntities()
      loadFactsPerEntity()
    }
  }, [caseId, currentPage, searchQuery, typeFilter, reviewStatusFilter])

  const loadEntities = async () => {
    if (!caseId) return

    try {
      setLoading(true)
      const offset = (currentPage - 1) * pageSize
      const response = await apiClient.getMatterEntities(
        caseId,
        searchQuery || undefined,
        typeFilter !== 'all' ? typeFilter : undefined,
        reviewStatusFilter !== 'all' ? reviewStatusFilter : undefined,
        pageSize,
        offset
      )
      setEntities(response.entities)
      setTotal(response.total)
      
      // Extract unique entity types for filter dropdown
      const types = new Set<string>()
      response.entities.forEach((entity: Entity) => {
        if (entity.type) types.add(entity.type)
      })
      setAvailableTypes(Array.from(types).sort())
    } catch (error) {
      console.error('Error loading entities:', error)
      setEntities([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  const loadFactsPerEntity = async () => {
    if (!caseId) return

    try {
      setLoadingStats(true)
      const data = await apiClient.getFactsPerEntity(caseId)
      setFactsPerEntity(data)
    } catch (error) {
      console.error('Error loading facts per entity:', error)
      setFactsPerEntity([])
    } finally {
      setLoadingStats(false)
    }
  }

  const handleEdit = (entity: Entity) => {
    setEditingEntity(entity.id)
    setEditValues({
      name: entity.name,
      short_name: entity.short_name,
      email: entity.email,
      role: entity.role,
    })
  }

  const handleSave = async (entityId: string) => {
    // TODO: Implement API call to update entity
    // For now, just update local state
    setEntities(prevEntities =>
      prevEntities.map(entity =>
        entity.id === entityId
          ? { ...entity, ...editValues }
          : entity
      )
    )
    setEditingEntity(null)
    setEditValues({})
  }

  const handleCancel = () => {
    setEditingEntity(null)
    setEditValues({})
  }

  const handleViewFacts = (entity: Entity) => {
    // Navigate to facts page with entity filter
    router.push(`/cases/${caseIdParam}/facts?entity=${encodeURIComponent(entity.name)}`)
  }

  const handleReviewStatusChange = async (entityId: string, newStatus: string) => {
    try {
      await apiClient.updateEntityReviewStatus(
        entityId,
        newStatus as 'accepted' | 'rejected' | 'not_reviewed'
      )
      // Update local state
      setEntities(prevEntities =>
        prevEntities.map(entity =>
          entity.id === entityId ? { ...entity, review_status: newStatus } : entity
        )
      )
    } catch (error) {
      console.error('Error updating entity review status:', error)
      alert('Failed to update review status. Please try again.')
    }
  }

  const totalPages = Math.ceil(total / pageSize)

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Entities</h1>
        <p className="text-gray-600">View and manage all entities extracted from case documents</p>
      </div>

      {/* Entity Statistics from Facts */}
      {!loadingStats && factsPerEntity.length > 0 && (
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg border border-purple-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Entity Insights from Facts</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Entities with Facts */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entities with Facts</p>
                  <p className="text-3xl font-bold text-purple-600 mt-1">{factsPerEntity.length}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">👥</span>
                </div>
              </div>
            </div>

            {/* Total Facts Linked */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Facts Linked</p>
                  <p className="text-3xl font-bold text-blue-600 mt-1">
                    {factsPerEntity.reduce((sum, e) => sum + e.value, 0)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📊</span>
                </div>
              </div>
            </div>

            {/* Entity Types Count */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entity Types</p>
                  <p className="text-3xl font-bold text-green-600 mt-1">
                    {new Set(factsPerEntity.map(e => e.type)).size}
                  </p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🏷️</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top Entities by Fact Count */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Top Entities by Fact Count</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {factsPerEntity
                .sort((a, b) => b.value - a.value)
                .slice(0, 6)
                .map((entity, index) => (
                  <div
                    key={index}
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 hover:border-purple-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate" title={entity.name}>
                          {entity.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: entity.color + '20', color: entity.color }}
                          >
                            {entity.type}
                          </span>
                        </p>
                      </div>
                      <div className="ml-3 flex-shrink-0">
                        <div className="flex items-center gap-1">
                          <span className="text-lg font-bold text-purple-600">{entity.value}</span>
                          <span className="text-xs text-gray-500">facts</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Entity Type Distribution */}
          {(() => {
            const typeDistribution = factsPerEntity.reduce((acc, entity) => {
              acc[entity.type] = (acc[entity.type] || 0) + entity.value
              return acc
            }, {} as Record<string, number>)

            const sortedTypes = Object.entries(typeDistribution)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)

            return (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Facts by Entity Type</h3>
                <div className="space-y-2">
                  {sortedTypes.map(([type, count]) => {
                    const maxCount = sortedTypes[0][1]
                    const percentage = (count / maxCount) * 100
                    const entityColor = factsPerEntity.find(e => e.type === type)?.color || '#9333ea'

                    return (
                      <div key={type} className="bg-white rounded-lg p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">{type}</span>
                          <span className="text-sm font-semibold text-gray-900">{count} facts</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                              backgroundColor: entityColor
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Detailed Entity Table */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">All Entities with Facts</h3>
              <span className="text-xs text-gray-500">{factsPerEntity.length} entities</span>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entity Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Fact Count
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Percentage
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {factsPerEntity
                      .sort((a, b) => b.value - a.value)
                      .map((entity, index) => {
                        const totalFacts = factsPerEntity.reduce((sum, e) => sum + e.value, 0)
                        const percentage = ((entity.value / totalFacts) * 100).toFixed(1)
                        
                        return (
                          <tr key={index} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 w-2 h-2 rounded-full mr-2" style={{ backgroundColor: entity.color }} />
                                <span className="text-sm font-medium text-gray-900" title={entity.name}>
                                  {entity.name.length > 40 ? entity.name.substring(0, 40) + '...' : entity.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className="px-2 py-1 rounded text-xs font-medium"
                                style={{
                                  backgroundColor: entity.color + '20',
                                  color: entity.color
                                }}
                              >
                                {entity.type}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center">
                                <span className="text-sm font-semibold text-purple-600">{entity.value}</span>
                                <span className="text-xs text-gray-500 ml-1">facts</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 w-20 bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full transition-all"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: entity.color
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-600 w-10 text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() => {
                                  router.push(`/cases/${caseIdParam}/facts?entity=${encodeURIComponent(entity.name)}`)
                                }}
                                className="text-xs text-purple-600 hover:text-purple-700 font-medium hover:underline"
                              >
                                View Facts →
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search Box */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Type:</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All Types</option>
              {availableTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Review Status Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Review Status:</label>
            <select
              value={reviewStatusFilter}
              onChange={(e) => {
                setReviewStatusFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="all">All</option>
              <option value="accepted">Accepted</option>
              <option value="not_reviewed">Not Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          {/* Edit Column Toggle */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Edit Mode:</label>
            <button
              onClick={() => {
                // Toggle edit mode - for now just show/hide edit buttons
                // This could be enhanced to show/hide edit columns
              }}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {editingEntity ? 'Cancel' : 'Edit'}
            </button>
          </div>

          <div className="ml-auto text-sm text-gray-600">
            Total: {total} entities
          </div>
        </div>
      </div>

      {/* Entities Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">Loading entities...</div>
        ) : entities.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No entities found.</p>
            <p className="text-sm mt-2">Upload and process documents to extract entities.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      @name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Short Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Review Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entities.map((entity) => (
                    <tr key={entity.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingEntity === entity.id ? (
                          <input
                            type="text"
                            value={editValues.name || ''}
                            onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{entity.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                          {entity.type}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {entity['@name']}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingEntity === entity.id ? (
                          <input
                            type="text"
                            value={editValues.short_name || ''}
                            onChange={(e) => setEditValues({ ...editValues, short_name: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">{entity.short_name || '-'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingEntity === entity.id ? (
                          <input
                            type="email"
                            value={editValues.email || ''}
                            onChange={(e) => setEditValues({ ...editValues, email: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">{entity.email || '-'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingEntity === entity.id ? (
                          <input
                            type="text"
                            value={editValues.role || ''}
                            onChange={(e) => setEditValues({ ...editValues, role: e.target.value })}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          />
                        ) : (
                          <div className="text-sm text-gray-900">{entity.role || '-'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
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
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {editingEntity === entity.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleSave(entity.id)}
                              className="text-green-600 hover:text-green-700 font-medium"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleCancel}
                              className="text-gray-600 hover:text-gray-700"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 flex-wrap">
                            <button
                              onClick={() => handleEdit(entity)}
                              className="text-purple-600 hover:text-purple-700 font-medium"
                            >
                              Edit
                            </button>
                            {entity.review_status === 'not_reviewed' ? (
                              <button
                                onClick={() => handleReviewStatusChange(entity.id, 'accepted')}
                                className="text-green-600 hover:text-green-700 font-medium"
                              >
                                Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReviewStatusChange(entity.id, 'not_reviewed')}
                                className="text-gray-600 hover:text-gray-700"
                              >
                                Undo
                              </button>
                            )}
                            <button
                              onClick={() => handleViewFacts(entity)}
                              className="text-blue-600 hover:text-blue-700 font-medium"
                            >
                              View {entity.related_facts_count} related facts
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} entities
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-2 border rounded-lg text-sm font-medium ${
                            currentPage === pageNum
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

