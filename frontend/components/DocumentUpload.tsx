'use client'

import { useState, useRef } from 'react'
import { apiClient, UploadResponse } from '@/lib/api'

interface DocumentUploadProps {
  matterId: string
  onUploadSuccess?: () => void
}

interface UploadProgress {
  total: number
  completed: number
  failed: number
  currentFile?: string
}

export default function DocumentUpload({ matterId, onUploadSuccess }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'folder'>('file')
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    if (files.length === 1) {
      await uploadFile(files[0])
    } else {
      await uploadMultipleFiles(Array.from(files))
    }
  }

  const handleFolderSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    await uploadMultipleFiles(Array.from(files))
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    setUploadStatus(null)
    setUploadProgress(null)

    try {
      const result: UploadResponse = await apiClient.uploadDocument(matterId, file)
      
      if (result.success !== false) {
        setUploadStatus({
          type: 'success',
          message: result.is_duplicate 
            ? `File uploaded successfully (duplicate detected: ${result.document_id})`
            : `File uploaded successfully! Document ID: ${result.document_id}`
        })
        
        if (onUploadSuccess) {
          onUploadSuccess()
        }
      } else {
        setUploadStatus({
          type: 'error',
          message: result.error || 'Upload failed'
        })
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const uploadMultipleFiles = async (files: File[]) => {
    setUploading(true)
    setUploadStatus(null)
    setUploadProgress({
      total: files.length,
      completed: 0,
      failed: 0
    })

    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    try {
      // Use batch upload endpoint if available, otherwise upload sequentially
      const results = await apiClient.uploadDocumentsBatch(matterId, files, (progress) => {
        setUploadProgress({
          total: files.length,
          completed: progress.completed,
          failed: progress.failed,
          currentFile: progress.currentFile
        })
      })

      successCount = results.filter(r => r.success !== false).length
      failCount = results.filter(r => r.success === false).length

      results.forEach((result, index) => {
        if (result.success === false) {
          errors.push(`${files[index].name}: ${result.error || 'Upload failed'}`)
        }
      })

      if (successCount > 0) {
        setUploadStatus({
          type: 'success',
          message: `Successfully uploaded ${successCount} file${successCount !== 1 ? 's' : ''}${failCount > 0 ? `, ${failCount} failed` : ''}`
        })
        
        if (onUploadSuccess) {
          onUploadSuccess()
        }
      } else {
        setUploadStatus({
          type: 'error',
          message: `All uploads failed. ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`
        })
      }
    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Upload failed'
      })
    } finally {
      setUploading(false)
      setUploadProgress(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (folderInputRef.current) {
        folderInputRef.current.value = ''
      }
    }
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      if (files.length === 1) {
        await uploadFile(files[0])
      } else {
        await uploadMultipleFiles(files)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Add documents to review</h2>
      
      {/* Upload Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setUploadMode('file')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadMode === 'file'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          disabled={uploading}
        >
          Upload File
        </button>
        <button
          type="button"
          onClick={() => setUploadMode('folder')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            uploadMode === 'folder'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          disabled={uploading}
        >
          Upload Folder
        </button>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-purple-400 transition-colors cursor-pointer"
      >
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
          accept=".pdf,.docx,.doc,.msg,.eml,.txt,.csv,.xlsx,.xls,.jpg,.jpeg,.png,.gif,.tiff,.bmp"
          multiple
          disabled={uploading}
        />
        <input
          ref={folderInputRef}
          type="file"
          onChange={handleFolderSelect}
          className="hidden"
          id="folder-upload"
          webkitdirectory=""
          directory=""
          multiple
          disabled={uploading}
        />
        
        {uploading ? (
          <div className="space-y-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            {uploadProgress ? (
              <>
                <p className="text-sm text-gray-600">
                  Uploading {uploadProgress.completed + uploadProgress.failed} of {uploadProgress.total} files...
                </p>
                {uploadProgress.currentFile && (
                  <p className="text-xs text-gray-500">{uploadProgress.currentFile}</p>
                )}
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((uploadProgress.completed + uploadProgress.failed) / uploadProgress.total) * 100}%`
                    }}
                  ></div>
                </div>
                <p className="text-xs text-gray-500">
                  {uploadProgress.completed} succeeded, {uploadProgress.failed} failed
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-600">Uploading...</p>
            )}
          </div>
        ) : (
          <>
            <div className="text-4xl mb-4">📄</div>
            {uploadMode === 'file' ? (
              <label htmlFor="file-upload" className="cursor-pointer">
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop file(s) here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  Supports: PDF, DOCX, MSG, EML, TXT, CSV, images
                </p>
                <button
                  type="button"
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Select File(s)
                </button>
              </label>
            ) : (
              <label htmlFor="folder-upload" className="cursor-pointer">
                <p className="text-sm text-gray-600 mb-2">
                  Drag and drop a folder here, or click to browse
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  All files in the selected folder will be uploaded
                </p>
                <button
                  type="button"
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors"
                  onClick={() => folderInputRef.current?.click()}
                >
                  Select Folder
                </button>
              </label>
            )}
          </>
        )}
      </div>

      {uploadStatus && (
        <div className={`mt-4 p-3 rounded-lg ${
          uploadStatus.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <p className="text-sm">{uploadStatus.message}</p>
        </div>
      )}
    </div>
  )
}

