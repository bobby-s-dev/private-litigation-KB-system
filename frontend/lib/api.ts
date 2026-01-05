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
    return this.request<Matter>(`/api/matters/${matterId}`)
  }
}

export const apiClient = new ApiClient()

