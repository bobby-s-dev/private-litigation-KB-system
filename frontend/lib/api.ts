const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface Document {
  id: string
  filename: string
  file_name: string
  document_type: string
  created_at: string
  ingested_at: string
  processing_status: string
  file_size?: number
  citations?: number
  relatedFacts?: number
  facts_count?: number
  entities_count?: number
}

export interface UploadResponse {
  document_id: string
  is_duplicate: boolean
  success: boolean
  error?: string
  processing_stages?: {
    upload: 'pending' | 'processing' | 'completed' | 'failed'
    security_check: 'pending' | 'processing' | 'completed' | 'failed'
    metadata_extraction: 'pending' | 'processing' | 'completed' | 'failed'
    processing: 'pending' | 'processing' | 'completed' | 'failed'
  }
  security_warnings?: string[]
}

export interface Matter {
  id: string
  matter_name: string
  matter_number: string
  status: string
  description?: string
}

class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_BASE_URL
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || `HTTP error! status: ${response.status}`)
    }

    return response.json()
  }

  async uploadDocument(
    matterId: string,
    file: File,
    documentType?: string,
    tags?: string[],
    categories?: string[]
  ): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('matter_id', matterId)
    if (documentType) formData.append('document_type', documentType)
    if (tags) tags.forEach(tag => formData.append('tags', tag))
    if (categories) categories.forEach(cat => formData.append('categories', cat))

    const response = await fetch(`${this.baseUrl}/api/ingestion/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || `Upload failed: ${response.statusText}`)
    }

    return response.json()
  }

  async uploadDocumentsBatch(
    matterId: string,
    files: File[],
    onProgress?: (progress: { completed: number; failed: number; currentFile?: string }) => void,
    documentType?: string,
    tags?: string[],
    categories?: string[]
  ): Promise<Array<UploadResponse & { filename: string }>> {
    const formData = new FormData()
    files.forEach(file => {
      formData.append('files', file)
    })
    formData.append('matter_id', matterId)
    if (documentType) formData.append('document_type', documentType)
    if (tags) tags.forEach(tag => formData.append('tags', tag))
    if (categories) categories.forEach(cat => formData.append('categories', cat))

    try {
      const response = await fetch(`${this.baseUrl}/api/ingestion/upload-batch`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: response.statusText }))
        throw new Error(error.detail || `Batch upload failed: ${response.statusText}`)
      }

      const result = await response.json()
      const results = result.results || []

      // Update progress
      if (onProgress) {
        let completed = 0
        let failed = 0
        results.forEach((r: any, index: number) => {
          if (r.success !== false) {
            completed++
          } else {
            failed++
          }
          onProgress({
            completed,
            failed,
            currentFile: files[index]?.name
          })
        })
      }

      return results
    } catch (error) {
      // If batch upload fails, fall back to sequential upload
      console.warn('Batch upload failed, falling back to sequential upload:', error)
      return this.uploadDocumentsSequential(matterId, files, onProgress, documentType, tags, categories)
    }
  }

  private async uploadDocumentsSequential(
    matterId: string,
    files: File[],
    onProgress?: (progress: { completed: number; failed: number; currentFile?: string }) => void,
    documentType?: string,
    tags?: string[],
    categories?: string[]
  ): Promise<Array<UploadResponse & { filename: string }>> {
    const results: Array<UploadResponse & { filename: string }> = []
    let completed = 0
    let failed = 0

    for (const file of files) {
      try {
        if (onProgress) {
          onProgress({ completed, failed, currentFile: file.name })
        }

        const result = await this.uploadDocument(matterId, file, documentType, tags, categories)
        results.push({ ...result, filename: file.name })
        completed++
      } catch (error) {
        results.push({
          filename: file.name,
          document_id: '',
          is_duplicate: false,
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        })
        failed++
      }

      if (onProgress) {
        onProgress({ completed, failed, currentFile: file.name })
      }
    }

    return results
  }

  async getDocumentsByMatter(matterId: string): Promise<Document[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/documents?matter_id=${matterId}`)
      if (response.ok) {
        const data = await response.json()
        return data.documents || []
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    }
    return []
  }

  async getMatter(matterId: string): Promise<Matter> {
    // Try to get by ID first, then by matter_number
    try {
      return await this.request<Matter>(`/api/matters/${matterId}`)
    } catch (error) {
      // If not found by ID, try by matter_number
      return await this.request<Matter>(`/api/matters/by-number/${matterId}`)
    }
  }

  async createMatter(matterNumber: string, matterName: string): Promise<Matter> {
    const response = await fetch(`${this.baseUrl}/api/matters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        matter_number: matterNumber,
        matter_name: matterName,
        matter_type: 'other'
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: response.statusText }))
      throw new Error(error.detail || `Failed to create matter: ${response.statusText}`)
    }

    return response.json()
  }

  async listMatters(): Promise<Matter[]> {
    return this.request<Matter[]>('/api/matters')
  }

  async getDocument(documentId: string): Promise<any> {
    return this.request<any>(`/api/documents/${documentId}`)
  }

  async getSuggestedFacts(documentId: string): Promise<any[]> {
    return this.request<any[]>(`/api/documents/${documentId}/review/facts`)
  }

  async extractFacts(documentId: string): Promise<{ facts: any[]; extracted_count: number; message: string }> {
    return this.request<{ facts: any[]; extracted_count: number; message: string }>(
      `/api/documents/${documentId}/review/facts/extract`,
      { method: 'POST' }
    )
  }

  async getDocumentEntities(documentId: string): Promise<any[]> {
    return this.request<any[]>(`/api/documents/${documentId}/review/entities`)
  }

  async extractEntities(documentId: string): Promise<{ entities: any[]; extracted_count: number; message: string }> {
    return this.request<{ entities: any[]; extracted_count: number; message: string }>(
      `/api/documents/${documentId}/review/entities/extract`,
      { method: 'POST' }
    )
  }

  async getDocumentSummary(documentId: string): Promise<any> {
    return this.request<any>(`/api/documents/${documentId}/review/summary`)
  }

  async getFactsPerEntity(matterId: string): Promise<Array<{ name: string; value: number; color: string; type: string }>> {
    return this.request<Array<{ name: string; value: number; color: string; type: string }>>(
      `/api/documents/matter/${matterId}/facts-per-entity`
    )
  }

  async getMatterEntities(
    matterId: string,
    search?: string,
    entityType?: string,
    reviewStatus?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{
    total: number
    limit: number
    offset: number
    entities: Array<{
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
    }>
  }> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    if (search) {
      params.append('search', search)
    }
    if (entityType) {
      params.append('entity_type', entityType)
    }
    if (reviewStatus) {
      params.append('review_status', reviewStatus)
    }
    return this.request<{
      total: number
      limit: number
      offset: number
      entities: Array<{
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
      }>
    }>(`/api/documents/matter/${matterId}/entities?${params.toString()}`)
  }

  async updateEntityReviewStatus(
    entityId: string,
    reviewStatus: 'accepted' | 'rejected' | 'not_reviewed',
    reviewNotes?: string
  ): Promise<{
    id: string
    review_status: string
    reviewed_at: string | null
  }> {
    const params = new URLSearchParams({
      review_status: reviewStatus,
    })
    if (reviewNotes) {
      params.append('review_notes', reviewNotes)
    }
    return this.request<{
      id: string
      review_status: string
      reviewed_at: string | null
    }>(`/api/documents/entities/${entityId}/review-status?${params.toString()}`, {
      method: 'PATCH',
    })
  }

  async getMatterFacts(
    matterId: string,
    limit: number = 20,
    offset: number = 0,
    reviewStatus?: string,
    entity?: string
  ): Promise<{
    total: number
    limit: number
    offset: number
    facts: Array<{
      id: string
      date_time: string | null
      fact: string
      issues: string[]
      evidence: string
      review_status: string
      confidence: number
      source_text: string
      document_id: string
      document_name: string
    }>
  }> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
    })
    if (reviewStatus) {
      params.append('review_status', reviewStatus)
    }
    if (entity) {
      params.append('entity', entity)
    }
    return this.request<{
      total: number
      limit: number
      offset: number
      facts: Array<{
        id: string
        date_time: string | null
        fact: string
        issues: string[]
        evidence: string
        review_status: string
        confidence: number
        source_text: string
        document_id: string
        document_name: string
      }>
    }>(`/api/documents/matter/${matterId}/facts?${params.toString()}`)
  }

  async updateFactReviewStatus(
    factId: string,
    reviewStatus: 'accepted' | 'rejected' | 'not_reviewed',
    reviewNotes?: string
  ): Promise<{
    id: string
    review_status: string
    reviewed_at: string | null
  }> {
    const params = new URLSearchParams({
      review_status: reviewStatus,
    })
    if (reviewNotes) {
      params.append('review_notes', reviewNotes)
    }
    return this.request<{
      id: string
      review_status: string
      reviewed_at: string | null
    }>(`/api/documents/facts/${factId}/review-status?${params.toString()}`, {
      method: 'PATCH',
    })
  }

  async deleteFact(factId: string): Promise<{ id: string; deleted: boolean }> {
    return this.request<{ id: string; deleted: boolean }>(`/api/documents/facts/${factId}`, {
      method: 'DELETE',
    })
  }

  async updateEntity(
    entityId: string,
    updates: {
      name?: string
      short_name?: string
      email?: string
      role?: string
    }
  ): Promise<{
    id: string
    name: string
    short_name: string
    email: string
    role: string
    type: string
    review_status: string
  }> {
    const params = new URLSearchParams()
    if (updates.name !== undefined) params.append('name', updates.name)
    if (updates.short_name !== undefined) params.append('short_name', updates.short_name)
    if (updates.email !== undefined) params.append('email', updates.email)
    if (updates.role !== undefined) params.append('role', updates.role)
    
    return this.request<{
      id: string
      name: string
      short_name: string
      email: string
      role: string
      type: string
      review_status: string
    }>(`/api/documents/entities/${entityId}?${params.toString()}`, {
      method: 'PATCH',
    })
  }

  async deleteEntity(entityId: string): Promise<{ id: string; deleted: boolean }> {
    return this.request<{ id: string; deleted: boolean }>(`/api/documents/entities/${entityId}`, {
      method: 'DELETE',
    })
  }

  // Pattern Detection & Knowledge Base APIs
  async detectRicoPatterns(matterId?: string, entityIds?: string[]): Promise<{
    recurring_actors: any[]
    timing_sequences: any[]
    coordinated_actions: any[]
    financial_patterns: any[]
    communication_patterns: any[]
    overall_confidence: number
  }> {
    const params = new URLSearchParams()
    if (matterId) params.append('matter_id', matterId)
    if (entityIds) entityIds.forEach(id => params.append('entity_ids', id))
    
    return this.request<{
      recurring_actors: any[]
      timing_sequences: any[]
      coordinated_actions: any[]
      financial_patterns: any[]
      communication_patterns: any[]
      overall_confidence: number
    }>(`/api/patterns/detect/rico?${params.toString()}`)
  }

  async detectInconsistencies(matterId?: string): Promise<{
    inconsistencies: any[]
    count: number
  }> {
    const params = new URLSearchParams()
    if (matterId) params.append('matter_id', matterId)
    
    return this.request<{
      inconsistencies: any[]
      count: number
    }>(`/api/patterns/detect/inconsistencies?${params.toString()}`)
  }

  async suggestPatterns(matterId?: string, useAi: boolean = true): Promise<{
    suggestions: any[]
    count: number
  }> {
    const params = new URLSearchParams()
    if (matterId) params.append('matter_id', matterId)
    params.append('use_ai', useAi.toString())
    
    return this.request<{
      suggestions: any[]
      count: number
    }>(`/api/patterns/suggest?${params.toString()}`)
  }

  async getMatterPatternSummary(matterId: string): Promise<{
    matter_id: string
    rico_patterns: any
    inconsistencies: any[]
    suggestions: any[]
    summary: {
      total_patterns: number
      total_inconsistencies: number
      total_suggestions: number
      overall_confidence: number
    }
  }> {
    return this.request<{
      matter_id: string
      rico_patterns: any
      inconsistencies: any[]
      suggestions: any[]
      summary: {
        total_patterns: number
        total_inconsistencies: number
        total_suggestions: number
        overall_confidence: number
      }
    }>(`/api/patterns/matter/${matterId}/summary`)
  }

  async classifyDocument(documentId: string): Promise<{
    document_type: string
    categories: string[]
    topics: string[]
    matter_tags: string[]
    suggested_name: string | null
    confidence: number
  }> {
    return this.request<{
      document_type: string
      categories: string[]
      topics: string[]
      matter_tags: string[]
      suggested_name: string | null
      confidence: number
    }>(`/api/patterns/documents/${documentId}/classify`)
  }

  async groupDocumentsByIssue(matterId: string): Promise<{
    matter_id: string
    groups: Record<string, any[]>
    group_count: number
  }> {
    return this.request<{
      matter_id: string
      groups: Record<string, any[]>
      group_count: number
    }>(`/api/patterns/matter/${matterId}/group-by-issue`)
  }

  async applyNamingConvention(
    documentId: string,
    convention: 'standard' | 'simple' | 'descriptive' = 'standard'
  ): Promise<{
    document_id: string
    original_name: string
    suggested_name: string
    convention: string
  }> {
    const params = new URLSearchParams({ convention })
    return this.request<{
      document_id: string
      original_name: string
      suggested_name: string
      convention: string
    }>(`/api/patterns/documents/${documentId}/apply-naming?${params.toString()}`, {
      method: 'POST',
    })
  }

  async ragQueryEnhanced(
    question: string,
    matterId?: string,
    includePatterns: boolean = true
  ): Promise<{
    success: boolean
    answer: string
    citations: any[]
    sources_used: number
    chunks_used: number
    confidence: number
    query: string
    patterns?: any
  }> {
    const params = new URLSearchParams({ question })
    if (matterId) params.append('matter_id', matterId)
    params.append('include_patterns', includePatterns.toString())
    
    return this.request<{
      success: boolean
      answer: string
      citations: any[]
      sources_used: number
      chunks_used: number
      confidence: number
      query: string
      patterns?: any
    }>(`/api/patterns/rag/query-enhanced?${params.toString()}`, {
      method: 'POST',
    })
  }

  async generateSummary(
    matterId?: string,
    documentIds?: string[],
    summaryType: 'comprehensive' | 'timeline' | 'key_facts' = 'comprehensive'
  ): Promise<{
    summary_type: string
    summary: string
    citations?: any[]
    timeline?: any[]
    events_count?: number
    patterns?: any
  }> {
    const params = new URLSearchParams({ summary_type: summaryType })
    if (matterId) params.append('matter_id', matterId)
    if (documentIds) documentIds.forEach(id => params.append('document_ids', id))
    
    return this.request<{
      summary_type: string
      summary: string
      citations?: any[]
      timeline?: any[]
      events_count?: number
      patterns?: any
    }>(`/api/patterns/rag/generate-summary?${params.toString()}`, {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient()

