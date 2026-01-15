'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2, BarChart3, Tag, Edit, Trash2, FileText, Users, Check, X } from 'lucide-react'
import { apiClient } from '@/lib/api'
import Tooltip from '@/components/Tooltip'

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
  const [pageSize, setPageSize] = useState(50)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all')
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null)
  const [editValues, setEditValues] = useState<Partial<Entity>>({})
  const [availableTypes, setAvailableTypes] = useState<string[]>([])
  const [factsPerEntity, setFactsPerEntity] = useState<Array<{ name: string; value: number; color: string; type: string }>>([])
  const [loadingStats, setLoadingStats] = useState(true)
  const [savingEntity, setSavingEntity] = useState<string | null>(null)
  const [deletingEntity, setDeletingEntity] = useState<string | null>(null)
  const [showStatistics, setShowStatistics] = useState(true)
  const [showEditDialog, setShowEditDialog] = useState(false)

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
  }, [caseId, currentPage, pageSize, searchQuery, typeFilter, reviewStatusFilter])

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
    setEditingEntity(entity)
    setEditValues({
      name: entity.name,
      type: entity.type,
      '@name': entity['@name'],
      short_name: entity.short_name,
      email: entity.email,
      role: entity.role,
    })
    setShowEditDialog(true)
  }

  const handleSave = async () => {
    if (!editingEntity) return
    
    try {
      setSavingEntity(editingEntity.id)
      // Only send fields that the API accepts (name, short_name, email, role)
      const updatePayload: {
        name?: string
        short_name?: string
        email?: string
        role?: string
      } = {}
      
      if (editValues.name !== undefined) updatePayload.name = editValues.name
      if (editValues.short_name !== undefined) updatePayload.short_name = editValues.short_name
      if (editValues.email !== undefined) updatePayload.email = editValues.email
      if (editValues.role !== undefined) updatePayload.role = editValues.role
      
      const updatedEntity = await apiClient.updateEntity(editingEntity.id, updatePayload)
      
      // Update local state with the response from backend
      setEntities(prevEntities =>
        prevEntities.map(entity =>
          entity.id === editingEntity.id
            ? { ...entity, ...updatedEntity }
            : entity
        )
      )
      setShowEditDialog(false)
      setEditingEntity(null)
      setEditValues({})
    } catch (error) {
      console.error('Error updating entity:', error)
      alert('Failed to update entity. Please try again.')
    } finally {
      setSavingEntity(null)
    }
  }

  const handleDelete = async (entityId: string, entityName: string) => {
    if (!confirm(`Are you sure you want to delete the entity "${entityName}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeletingEntity(entityId)
      await apiClient.deleteEntity(entityId)
      
      // Remove from local state
      setEntities(prevEntities => prevEntities.filter(entity => entity.id !== entityId))
      setTotal(prev => prev - 1)
      
      // Reload facts per entity data
      loadFactsPerEntity()
    } catch (error) {
      console.error('Error deleting entity:', error)
      alert('Failed to delete entity. Please try again.')
    } finally {
      setDeletingEntity(null)
    }
  }

  const handleCancel = () => {
    setShowEditDialog(false)
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
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Entities</h1>
            <p className="text-gray-600">View and manage all entities extracted from case documents</p>
          </div>
          {loadingStats && factsPerEntity.length === 0 && (
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="animate-spin h-4 w-4 text-primary-600" />
              Loading insights...
            </div>
          )}
        </div>
      </div>

      {/* Entity Statistics from Facts */}
      {!loadingStats && factsPerEntity.length > 0 && (
        <div className="bg-gradient-to-br bg-primary-50 to-blue-50 rounded-lg border border-primary-200 mb-6">
          {/* Collapsible Header */}
          <div className="p-6 pb-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Entity Insights from Facts</h2>
              <button
                onClick={() => setShowStatistics(!showStatistics)}
                className="px-3 py-1 text-sm bg-white border border-primary-300 text-primary-700 hover:bg-primary-100 rounded-lg font-medium transition-colors"
              >
                {showStatistics ? '▲ Collapse' : '▼ Expand'}
              </button>
            </div>
          </div>
          
          {showStatistics && (
            <div className="px-6 pb-6">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Total Entities with Facts */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Entities with Facts</p>
                  <p className="text-3xl font-bold text-primary-600 mt-1">{factsPerEntity.length}</p>
                </div>
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary-600" />
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
                  <BarChart3 className="h-6 w-6 text-blue-600" />
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
                  <Tag className="h-6 w-6 text-green-600" />
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
                    className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 hover:border-primary-300 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <Tooltip content={entity.name}>
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {entity.name}
                          </p>
                        </Tooltip>
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
                          <span className="text-lg font-bold text-primary-600">{entity.value}</span>
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
              <div className="max-h-96 overflow-y-auto">
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
                          <tr key={index} className="hover:bg-gray-50 transition-colors align-top">
                            <td className="px-4 py-3 text-sm text-gray-500">
                              {index + 1}
                            </td>
                            <td className="px-4 py-3 whitespace-normal break-words">
                              <div className="flex items-center">
                                <div className="flex-shrink-0 w-2 h-2 rounded-full mr-2 mt-0.5" style={{ backgroundColor: entity.color }} />
                                <Tooltip content={entity.name}>
                                  <span className="text-sm font-medium text-gray-900 break-words">
                                    {entity.name}
                                  </span>
                                </Tooltip>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-normal break-words">
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
                            <td className="px-4 py-3 whitespace-normal">
                              <div className="flex items-center">
                                <span className="text-sm font-semibold text-primary-600">{entity.value}</span>
                                <span className="text-xs text-gray-500 ml-1">facts</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-normal">
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="flex-1 min-w-[80px] bg-gray-200 rounded-full h-1.5">
                                  <div
                                    className="h-1.5 rounded-full transition-all"
                                    style={{
                                      width: `${percentage}%`,
                                      backgroundColor: entity.color
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-medium text-gray-600 text-right">
                                  {percentage}%
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-normal">
                              <button
                                onClick={() => {
                                  router.push(`/cases/${caseIdParam}/facts?entity=${encodeURIComponent(entity.name)}`)
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700 font-medium hover:underline"
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
        </div>
      )}

      {/* Search and Filters */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 mb-6">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
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
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All</option>
              <option value="accepted">Accepted</option>
              <option value="not_reviewed">Not Reviewed</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="px-3 py-1.5 bg-primary-100 text-primary-700 rounded-lg text-sm font-semibold">
              {total} {total === 1 ? 'entity' : 'entities'}
            </div>
          </div>
        </div>
      </div>

      {/* Entities Table */}
      <div className="bg-white rounded-lg border-2 border-gray-200 shadow-sm overflow-hidden">
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
              <table className="w-full table-fixed">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[20%]">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                      @name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[12%]">
                      Short Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[15%]">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                      Role
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[10%]">
                      Review Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[16%]">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {entities.map((entity) => (
                    <tr key={entity.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 break-words align-top">
                        <div className="text-sm font-medium text-gray-900 break-words whitespace-normal">
                          {entity.name}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium inline-block truncate max-w-full" title={entity.type}>
                          {entity.type}
                        </span>
                      </td>
                      <td className="px-4 py-4 break-words align-top">
                        <div className="text-sm text-gray-600 break-words whitespace-normal">
                          {entity['@name'] || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Tooltip content={entity.short_name || ''}>
                          <div className="text-sm text-gray-900 truncate">
                            {entity.short_name || '-'}
                          </div>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Tooltip content={entity.email || ''}>
                          <div className="text-sm text-gray-900 truncate">
                            {entity.email || '-'}
                          </div>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <Tooltip content={entity.role || ''}>
                          <div className="text-sm text-gray-900 truncate">
                            {entity.role || '-'}
                          </div>
                        </Tooltip>
                      </td>
                      <td className="px-4 py-4 align-top">
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm align-top">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-2">
                            <button
                              onClick={() => handleEdit(entity)}
                              disabled={deletingEntity === entity.id}
                              className="w-full lg:w-auto px-2.5 py-1 text-xs text-primary-600 hover:bg-primary-50 rounded font-medium border border-primary-200 hover:border-primary-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title="Edit entity"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </button>
                            {entity.review_status === 'not_reviewed' ? (
                              <button
                                onClick={() => handleReviewStatusChange(entity.id, 'accepted')}
                                disabled={deletingEntity === entity.id}
                                className="w-full lg:w-auto px-2.5 py-1 text-xs text-green-600 hover:bg-green-50 rounded font-medium border border-green-200 hover:border-green-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                title="Accept entity"
                              >
                                <Check className="h-3 w-3 mr-1" />
                                Accept
                              </button>
                            ) : (
                              <button
                                onClick={() => handleReviewStatusChange(entity.id, 'not_reviewed')}
                                disabled={deletingEntity === entity.id}
                                className="w-full lg:w-auto px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-300 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                title="Mark as not reviewed"
                              >
                                <X className="h-3 w-3 mr-1" />
                                Undo
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(entity.id, entity.name)}
                              disabled={deletingEntity === entity.id}
                              className="w-full lg:w-auto px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded font-medium border border-red-200 hover:border-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title="Delete entity"
                            >
                              {deletingEntity === entity.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                          <button
                            onClick={() => handleViewFacts(entity)}
                            disabled={deletingEntity === entity.id}
                            className="w-full px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium border border-blue-200 hover:border-blue-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                            title="View related facts"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            View {entity.related_facts_count} facts
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-700">
                    Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, total)} of {total} entities
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-700">Rows per page:</label>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value))
                        setCurrentPage(1)
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
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
                              ? 'bg-primary-600 text-white border-primary-600'
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

      {/* Edit Entity Dialog */}
      {showEditDialog && editingEntity && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Edit Entity</h2>
              <button
                onClick={handleCancel}
                disabled={savingEntity === editingEntity.id}
                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                title="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editValues.name || ''}
                  onChange={(e) => setEditValues({ ...editValues, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Entity name"
                />
              </div>

              {/* Type Field - Read Only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type <span className="text-gray-400 text-xs">(read-only)</span>
                </label>
                <input
                  type="text"
                  value={editValues.type || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                />
              </div>

              {/* @name Field - Read Only */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  @name <span className="text-gray-400 text-xs">(read-only)</span>
                </label>
                <input
                  type="text"
                  value={editValues['@name'] || ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                  placeholder="@name"
                />
              </div>

              {/* Short Name Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Short Name
                </label>
                <input
                  type="text"
                  value={editValues.short_name || ''}
                  onChange={(e) => setEditValues({ ...editValues, short_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Short name"
                />
              </div>

              {/* Email Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editValues.email || ''}
                  onChange={(e) => setEditValues({ ...editValues, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="email@example.com"
                />
              </div>

              {/* Role Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={editValues.role || ''}
                  onChange={(e) => setEditValues({ ...editValues, role: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Role"
                />
              </div>
            </div>

            {/* Dialog Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={handleCancel}
                disabled={savingEntity === editingEntity.id}
                className="px-4 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={savingEntity === editingEntity.id || !editValues.name}
                className="px-4 py-2 bg-primary-600 text-white hover:bg-primary-700 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {savingEntity === editingEntity.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

