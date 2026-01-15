'use client'

import { useState, useRef } from 'react'
import { Check, X, AlertTriangle, FileText } from 'lucide-react'
import { apiClient, UploadResponse } from '@/lib/api'
import Tooltip from '@/components/Tooltip'

interface DocumentUploadProps {
  matterId: string
  onUploadSuccess?: () => void
}

interface UploadProgress {
  total: number
  completed: number
  failed: number
  currentFile?: string
  currentFileSize?: number
  uploadedBytes?: number
}

interface ProcessingStages {
  upload: 'pending' | 'processing' | 'completed' | 'failed'
  security_check: 'pending' | 'processing' | 'completed' | 'failed'
  metadata_extraction: 'pending' | 'processing' | 'completed' | 'failed'
  processing: 'pending' | 'processing' | 'completed' | 'failed'
}

export default function DocumentUpload({ matterId, onUploadSuccess }: DocumentUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [uploadMode, setUploadMode] = useState<'file' | 'folder'>('file')
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null)
  const [processingStages, setProcessingStages] = useState<ProcessingStages | null>(null)
  const [securityWarnings, setSecurityWarnings] = useState<string[]>([])
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
    setUploadProgress({
      total: 1,
      completed: 0,
      failed: 0,
      currentFile: file.name,
      currentFileSize: file.size,
      uploadedBytes: 0
    })
    setSecurityWarnings([])
    
    // Initialize processing stages
    setProcessingStages({
      upload: 'processing',
      security_check: 'pending',
      metadata_extraction: 'pending',
      processing: 'pending'
    })

    try {
      // Stage 1: Upload
      setProcessingStages(prev => prev ? { ...prev, upload: 'processing' } : null)
      // Update progress to show upload starting
      setUploadProgress(prev => prev ? { ...prev, uploadedBytes: 0 } : null)
      
      const result: UploadResponse = await apiClient.uploadDocument(matterId, file)
      
      // Mark upload as completed
      setUploadProgress(prev => prev ? { 
        ...prev, 
        completed: 1,
        uploadedBytes: file.size 
      } : null)
      
      // Update stages from response
      if (result.processing_stages) {
        setProcessingStages(result.processing_stages)
      } else {
        // If no stages in response, mark upload as completed
        setProcessingStages(prev => prev ? { ...prev, upload: 'completed' } : null)
      }
      
      if (result.security_warnings) {
        setSecurityWarnings(result.security_warnings)
      }
      
      if (result.success !== false) {
        // Use backend message if available, otherwise create custom message
        let message = result.message
        
        if (!message) {
          if (result.is_duplicate && result.duplicate_type === 'exact') {
            // Exact duplicate
            const existingFile = result.existing_document_filename || result.existing_document_title || 'existing document'
            message = `Duplicate detected: This file is identical to "${existingFile}". The file was not saved as it already exists in the system.`
          } else if (result.duplicate_type === 'near' && result.near_duplicates && result.near_duplicates.length > 0) {
            // Near duplicate
            const bestMatch = result.near_duplicates[0]
            const similarityPct = Math.round(bestMatch.similarity * 100)
            message = `Similar document found: This file is ${similarityPct}% similar to "${bestMatch.filename}". File was uploaded, but you may want to review for duplicates.`
            if (result.near_duplicates.length > 1) {
              message += ` (${result.near_duplicates.length} similar documents found)`
            }
          } else {
            // Normal upload
            message = `File uploaded successfully! Document ID: ${result.document_id}`
          }
        }
        
        setUploadStatus({
          type: result.is_duplicate || result.duplicate_type === 'near' ? 'warning' : 'success',
          message: message
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
      setProcessingStages(prev => prev ? {
        ...prev,
        upload: 'failed',
        security_check: 'failed',
        metadata_extraction: 'failed',
        processing: 'failed'
      } : null)
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
    
    // Calculate total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    
    setUploadProgress({
      total: files.length,
      completed: 0,
      failed: 0,
      currentFile: files[0]?.name,
      currentFileSize: files[0]?.size,
      uploadedBytes: 0
    })

    let successCount = 0
    let failCount = 0
    const errors: string[] = []
    let uploadedBytes = 0

    try {
      // Use batch upload endpoint if available, otherwise upload sequentially
      const results = await apiClient.uploadDocumentsBatch(matterId, files, (progress) => {
        // Calculate uploaded bytes based on completed files
        const completedFiles = files.slice(0, progress.completed)
        uploadedBytes = completedFiles.reduce((sum, file) => sum + file.size, 0)
        
        // Add current file progress if available
        const currentFileIndex = progress.completed + progress.failed
        const currentFile = files[currentFileIndex]
        
        setUploadProgress({
          total: files.length,
          completed: progress.completed,
          failed: progress.failed,
          currentFile: progress.currentFile || currentFile?.name,
          currentFileSize: currentFile?.size,
          uploadedBytes: uploadedBytes
        })
      })

      successCount = results.filter(r => r.success !== false).length
      failCount = results.filter(r => r.success === false).length
      
      // Count duplicates
      const exactDuplicates = results.filter(r => r.is_duplicate && r.duplicate_type === 'exact').length
      const nearDuplicates = results.filter(r => r.duplicate_type === 'near').length

      results.forEach((result, index) => {
        if (result.success === false) {
          errors.push(`${files[index].name}: ${result.error || 'Upload failed'}`)
        }
      })

      // Build status message with duplicate information
      let message = `Successfully processed ${successCount} file${successCount !== 1 ? 's' : ''}`
      const duplicateMessages: string[] = []
      
      if (exactDuplicates > 0) {
        duplicateMessages.push(`${exactDuplicates} exact duplicate${exactDuplicates !== 1 ? 's' : ''} detected (not saved)`)
      }
      if (nearDuplicates > 0) {
        duplicateMessages.push(`${nearDuplicates} similar document${nearDuplicates !== 1 ? 's' : ''} found`)
      }
      
      if (duplicateMessages.length > 0) {
        message += `. ${duplicateMessages.join(', ')}.`
      }
      
      if (failCount > 0) {
        message += ` ${failCount} failed.`
      }

      if (successCount > 0) {
        setUploadStatus({
          type: exactDuplicates > 0 || nearDuplicates > 0 ? 'warning' : 'success',
          message: message
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
              ? 'bg-primary-600 text-white'
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
              ? 'bg-primary-600 text-white'
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
        className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-400 transition-colors cursor-pointer"
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
          {...({ webkitdirectory: '', directory: '' } as any)}
          multiple
          disabled={uploading}
        />
        
        {uploading ? (
          <div className="space-y-4 w-full max-w-md mx-auto">
            {uploadProgress ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">
                    {uploadProgress.total === 1 
                      ? 'Uploading file...' 
                      : `Uploading ${uploadProgress.completed + uploadProgress.failed} of ${uploadProgress.total} files...`}
                  </p>
                  <span className="text-sm font-medium text-primary-600">
                    {Math.round(((uploadProgress.completed + uploadProgress.failed) / uploadProgress.total) * 100)}%
                  </span>
                </div>
                
                {uploadProgress.currentFile && (
                  <div className="space-y-1">
                    <Tooltip content={uploadProgress.currentFile}>
                      <p className="text-xs font-medium text-gray-700 truncate flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        {uploadProgress.currentFile}
                      </p>
                    </Tooltip>
                    {uploadProgress.currentFileSize && (
                      <p className="text-xs text-gray-500">
                        {formatFileSize(uploadProgress.currentFileSize)}
                        {uploadProgress.uploadedBytes !== undefined && uploadProgress.uploadedBytes > 0 && (
                          <span className="ml-2">
                            ({formatFileSize(uploadProgress.uploadedBytes)} uploaded)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
                
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-primary-500 to-primary-600 h-3 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.min(((uploadProgress.completed + uploadProgress.failed) / uploadProgress.total) * 100, 100)}%`,
                      minWidth: '2%'
                    }}
                  >
                    {((uploadProgress.completed + uploadProgress.failed) / uploadProgress.total) * 100 > 10 && (
                      <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                    )}
                  </div>
                </div>
                
                {uploadProgress.total > 1 && (
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      {uploadProgress.completed} succeeded
                    </span>
                    {uploadProgress.failed > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                        {uploadProgress.failed} failed
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : processingStages ? (
              <div className="space-y-4">
                <div className="space-y-3">
                  <ProcessingStage
                    label="Uploading"
                    status={processingStages.upload}
                  />
                  <ProcessingStage
                    label="Review (Security Check)"
                    status={processingStages.security_check}
                  />
                  <ProcessingStage
                    label="Get Metadata Automatically"
                    status={processingStages.metadata_extraction}
                  />
                  <ProcessingStage
                    label="Processing"
                    status={processingStages.processing}
                  />
                </div>
                
                {/* Overall progress bar for processing stages */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-600">
                    <span>Processing stages</span>
                    <span>
                      {[
                        processingStages.upload,
                        processingStages.security_check,
                        processingStages.metadata_extraction,
                        processingStages.processing
                      ].filter(s => s === 'completed').length} / 4 completed
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-primary-500 to-primary-600 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${([
                          processingStages.upload,
                          processingStages.security_check,
                          processingStages.metadata_extraction,
                          processingStages.processing
                        ].filter(s => s === 'completed').length / 4) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>
                
                {securityWarnings.length > 0 && (
                  <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                    <p className="font-medium mb-1">Security Warnings:</p>
                    <ul className="list-disc list-inside">
                      {securityWarnings.map((warning, idx) => (
                        <li key={idx}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-center gap-3">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                  <p className="text-sm font-medium text-gray-700">Preparing upload...</p>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary-600 h-2 rounded-full animate-pulse" style={{ width: '30%' }}></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              <FileText className="h-16 w-16 text-gray-400" />
            </div>
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
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
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
                  className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
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
        <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 ${
          uploadStatus.type === 'success' 
            ? 'bg-green-50 text-green-800 border border-green-200' 
            : uploadStatus.type === 'warning'
            ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {uploadStatus.type === 'warning' && <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />}
          {uploadStatus.type === 'success' && <Check className="h-5 w-5 flex-shrink-0 mt-0.5" />}
          <p className="text-sm">{uploadStatus.message}</p>
        </div>
      )}
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

function ProcessingStage({ label, status }: { label: string; status: 'pending' | 'processing' | 'completed' | 'failed' }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return (
          <Check className="h-5 w-5 text-green-600" />
        )
      case 'processing':
        return (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
        )
      case 'failed':
        return (
          <X className="h-5 w-5 text-red-600" />
        )
      default:
        return (
          <div className="h-5 w-5 rounded-full border-2 border-gray-300"></div>
        )
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'text-green-600'
      case 'processing':
        return 'text-primary-600'
      case 'failed':
        return 'text-red-600'
      default:
        return 'text-gray-400'
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0">
        {getStatusIcon()}
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${getStatusColor()}`}>
          {label}
        </p>
        {status === 'processing' && (
          <p className="text-xs text-gray-500 mt-1">In progress...</p>
        )}
        {status === 'completed' && (
          <p className="text-xs text-green-600 mt-1">Completed</p>
        )}
        {status === 'failed' && (
          <p className="text-xs text-red-600 mt-1">Failed</p>
        )}
      </div>
    </div>
  )
}

