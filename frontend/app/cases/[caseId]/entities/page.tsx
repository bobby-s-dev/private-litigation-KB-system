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
  const [editingEntity, setEditingEntity] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Partial<Entity>>({})
  const [availableTypes, setAvailableTypes] = useState<string[]>([])

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
    }
  }, [caseId, currentPage, searchQuery, typeFilter])

  const loadEntities = async () => {
    if (!caseId) return

    try {
      setLoading(true)
      const offset = (currentPage - 1) * pageSize
      const response = await apiClient.getMatterEntities(
        caseId,
        searchQuery || undefined,
        typeFilter !== 'all' ? typeFilter : undefined,
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
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleEdit(entity)}
                              className="text-purple-600 hover:text-purple-700 font-medium"
                            >
                              Edit
                            </button>
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

