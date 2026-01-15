'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { User, Lock, Save, CheckCircle, AlertCircle, Palette, Moon, Sun } from 'lucide-react'

export default function SettingsPage() {
  const { user, updateCredentials, logout } = useAuth()
  const { theme, primaryColor, setTheme, setPrimaryColor } = useTheme()
  const [username, setUsername] = useState(user?.username || '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [colorPickerValue, setColorPickerValue] = useState(primaryColor)

  // Update username when user changes
  useEffect(() => {
    if (user?.username) {
      setUsername(user.username)
    }
  }, [user])

  // Update color picker when primary color changes
  useEffect(() => {
    setColorPickerValue(primaryColor)
  }, [primaryColor])

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

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    setColorPickerValue(newColor)
    // Convert hex to rgb format
    const rgb = hexToRgb(newColor)
    if (rgb) {
      setPrimaryColor(`rgb(${rgb.r} ${rgb.g} ${rgb.b})`)
      setSuccess('Primary color updated!')
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    setSuccess(`Switched to ${newTheme} theme!`)
    setTimeout(() => setSuccess(''), 3000)
  }

  // Helper function to parse RGB string (for use in component)
  const parseRgb = (rgbString: string): { r: number; g: number; b: number } | null => {
    const match = rgbString.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/)
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      }
    }
    return null
  }

  // Helper function to convert hex to rgb
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null
  }

  // Helper function to convert rgb to hex
  const rgbToHex = (rgb: string): string => {
    const match = rgb.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/)
    if (match) {
      const r = parseInt(match[1], 10)
      const g = parseInt(match[2], 10)
      const b = parseInt(match[3], 10)
      return '#' + [r, g, b].map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('')
    }
    return '#7c3aed' // default purple
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">Settings</h1>
        <p className="text-gray-600 dark:text-gray-400">Update your username, password, theme, and appearance</p>
      </div>

      {/* Theme and Appearance Settings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Appearance
        </h2>
        
        <div className="space-y-6">
          {/* Theme Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Theme
            </label>
            <button
              type="button"
              onClick={handleThemeToggle}
              className="flex items-center gap-3 p-4 border-2 border-gray-300 dark:border-gray-600 rounded-lg transition-colors w-full"
              style={{
                borderColor: theme === 'dark' ? primaryColor : undefined
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = primaryColor
              }}
              onMouseLeave={(e) => {
                if (theme !== 'dark') {
                  e.currentTarget.style.borderColor = ''
                }
              }}
            >
              <div className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-100'}`}>
                {theme === 'dark' ? (
                  <Moon className="h-5 w-5 text-gray-300" />
                ) : (
                  <Sun className="h-5 w-5 text-gray-600" />
                )}
              </div>
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {theme === 'dark' ? 'Dark background with light text' : 'Light background with dark text'}
                </div>
              </div>
              <div className="text-sm font-medium" style={{ color: primaryColor }}>
                {theme === 'dark' ? 'ON' : 'OFF'}
              </div>
            </button>
          </div>

          {/* Primary Color Picker */}
          <div>
            <label htmlFor="primaryColor" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Primary Color
            </label>
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <input
                  id="primaryColor"
                  type="color"
                  value={rgbToHex(colorPickerValue)}
                  onChange={handleColorChange}
                  className="w-full h-12 rounded-lg border border-gray-300 dark:border-gray-600 cursor-pointer"
                  style={{ backgroundColor: primaryColor }}
                />
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="w-12 h-12 rounded-lg border-2 border-gray-300 dark:border-gray-600"
                  style={{ backgroundColor: primaryColor }}
                />
                <div className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {rgbToHex(colorPickerValue).toUpperCase()}
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Choose your preferred primary color for buttons, links, and accents
            </p>
            {/* Preset Colors */}
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { name: 'Purple', color: '#7c3aed' },
                { name: 'Blue', color: '#3b82f6' },
                { name: 'Green', color: '#10b981' },
                { name: 'Red', color: '#ef4444' },
                { name: 'Orange', color: '#f97316' },
                { name: 'Pink', color: '#ec4899' },
                { name: 'Indigo', color: '#6366f1' },
                { name: 'Teal', color: '#14b8a6' },
              ].map((preset) => {
                const rgb = hexToRgb(preset.color)
                const rgbString = rgb ? `rgb(${rgb.r} ${rgb.g} ${rgb.b})` : ''
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setColorPickerValue(rgbString)
                      setPrimaryColor(rgbString)
                      setSuccess(`Changed to ${preset.name}!`)
                      setTimeout(() => setSuccess(''), 3000)
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 dark:border-gray-600 transition-colors"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = primaryColor
                    }}
                    onMouseLeave={(e) => {
                      if (primaryColor !== rgbString) {
                        e.currentTarget.style.borderColor = ''
                      }
                    }}
                    style={{
                      borderColor: primaryColor === rgbString ? primaryColor : undefined,
                      backgroundColor: primaryColor === rgbString ? `${primaryColor}20` : undefined
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-4 h-4 rounded border border-gray-300"
                        style={{ backgroundColor: preset.color }}
                      />
                      {preset.name}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Settings Form */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-6">
        <form onSubmit={handleUpdateCredentials} className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <User className="h-5 w-5" />
            Account
          </h2>

          {/* Username Section */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties & { '--tw-ring-color': string }}
                placeholder="Enter new username"
                disabled={isLoading}
              />
            </div>
          </div>

          {/* Current Password Section */}
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties & { '--tw-ring-color': string }}
                placeholder="Enter current password to confirm changes"
                disabled={isLoading}
                required
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Required to confirm any changes
            </p>
          </div>

          {/* New Password Section */}
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties & { '--tw-ring-color': string }}
                placeholder="Enter new password (leave empty to keep current)"
                disabled={isLoading}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Leave empty if you only want to change username
            </p>
          </div>

          {/* Confirm New Password Section */}
          {newPassword && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties & { '--tw-ring-color': string }}
                  placeholder="Confirm new password"
                  disabled={isLoading}
                />
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
              <CheckCircle className="h-5 w-5 flex-shrink-0" />
              {success}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="text-white py-3 px-6 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{
                backgroundColor: primaryColor,
                '--tw-ring-color': primaryColor,
              } as React.CSSProperties & { '--tw-ring-color': string }}
              onMouseEnter={(e) => {
                const rgb = parseRgb(primaryColor)
                if (rgb) {
                  const darker = `rgb(${Math.max(0, rgb.r - 20)} ${Math.max(0, rgb.g - 20)} ${Math.max(0, rgb.b - 20)})`
                  e.currentTarget.style.backgroundColor = darker
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = primaryColor
              }}
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
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

