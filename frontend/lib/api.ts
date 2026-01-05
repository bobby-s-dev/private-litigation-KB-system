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

  async getDocumentEntities(documentId: string): Promise<any[]> {
    return this.request<any[]>(`/api/documents/${documentId}/review/entities`)
  }

  async getDocumentSummary(documentId: string): Promise<any> {
    return this.request<any>(`/api/documents/${documentId}/review/summary`)
  }

  async getFactsPerEntity(matterId: string): Promise<Array<{ name: string; value: number; color: string; type: string }>> {
    return this.request<Array<{ name: string; value: number; color: string; type: string }>>(
      `/api/documents/matter/${matterId}/facts-per-entity`
    )
  }

  async getMatterFacts(
    matterId: string,
    limit: number = 20,
    offset: number = 0,
    reviewStatus?: string
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
}

export const apiClient = new ApiClient()

