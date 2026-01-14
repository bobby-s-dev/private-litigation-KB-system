'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { User, Lock, Save, CheckCircle, AlertCircle } from 'lucide-react'

export default function SettingsPage() {
  const { user, updateCredentials, logout } = useAuth()
  const [username, setUsername] = useState(user?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Update username when user changes
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username)
    }
  }, [user])

  const handleUpdateCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setIsLoading(true)

    // Validate inputs
    if (!username.trim()) {
      setError('Username cannot be empty')
      setIsLoading(false)
      return
    }

    if (!currentPassword) {
      setError('Please enter your current password to confirm changes')
      setIsLoading(false)
      return
    }

    // Verify current password
    if (currentPassword !== user?.password) {
      setError('Current password is incorrect')
      setIsLoading(false)
      return
    }

    // If new password is provided, validate it
    if (newPassword) {
      if (newPassword.length < 4) {
        setError('New password must be at least 4 characters long')
        setIsLoading(false)
        return
      }

      if (newPassword !== confirmPassword) {
        setError('New passwords do not match')
        setIsLoading(false)
        return
      }
    }

    // Update credentials
    const updatedPassword = newPassword || currentPassword
    updateCredentials(username.trim(), updatedPassword)

    setSuccess('Credentials updated successfully!')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setIsLoading(false)

    // Clear success message after 3 seconds
    setTimeout(() => setSuccess(''), 3000)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Update your username and password</p>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
        <form onSubmit={handleUpdateCredentials} className="space-y-6">
          {/* Username Section */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter new username"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Current Password Section */}
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Current Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter current password to confirm changes"
                disabled={isLoading}
                required
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Required to confirm any changes
            </p>
          </div>

          {/* New Password Section */}
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
              New Password (optional)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter new password (leave empty to keep current)"
                disabled={isLoading}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Leave empty if you only want to change username
            </p>
          </div>

          {/* Confirm New Password Section */}
          {newPassword && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Confirm new password"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-purple-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-5 w-5" />
                  Save Changes
                </>
              )}
            </button>
            <button
              type="button"
              onClick={logout}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

