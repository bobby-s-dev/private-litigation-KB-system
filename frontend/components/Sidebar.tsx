'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Settings, Folder, Users, Check, FileText, HelpCircle, Home, LogOut, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

const sidebarItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard' },
  { icon: Folder, label: 'Cases', href: '/cases' },
  { icon: Users, label: 'Entities', href: '/entities' },
  // { icon: Check, label: 'Tasks', href: '/tasks' },
  { icon: FileText, label: 'Activity', href: '/activity' },
  { icon: Settings, label: 'Settings', href: '/settings' },
  { icon: HelpCircle, label: 'Help', href: '/help' },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
  // Get user initials
  const getUserInitials = () => {
    if (!user?.username) return 'U'
    const parts = user.username.trim().split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return user.username.substring(0, 2).toUpperCase()
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  const handleLogout = () => {
    logout()
    setIsMenuOpen(false)
  }

  return (
    <div className="fixed left-0 top-0 h-screen w-16 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col items-center py-4">
      {sidebarItems.map((item) => {
        const isActive = pathname?.startsWith(item.href) || false
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`w-12 h-12 flex items-center justify-center rounded-lg mb-2 transition-colors ${
              isActive
                ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </Link>
        )
      })}
      <div className="mt-auto mb-4 relative" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-12 h-12 flex items-center justify-center rounded-full text-white font-semibold hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800"
          style={{ backgroundColor: 'var(--primary-color)' }}
          title={user?.username || 'User'}
        >
          {getUserInitials()}
        </button>
        
        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute bottom-16 left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 flex items-center justify-center rounded-full text-white text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  {getUserInitials()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {user?.username || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    Signed in
                  </p>
                </div>
              </div>
            </div>
            
            {/* Menu Items */}
            <div className="py-1">
              <Link
                href="/settings"
                onClick={() => setIsMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <User className="w-4 h-4" />
                <span>Settings</span>
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

