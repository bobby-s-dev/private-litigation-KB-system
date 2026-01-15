'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Settings, Folder, Users, Check, FileText, HelpCircle, Home, LogOut, User, ChevronLeft, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/contexts/SidebarContext'

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
  const { isCollapsed, toggleSidebar } = useSidebar()
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
    <div className={`fixed left-0 top-0 h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col transition-all duration-300 ease-in-out ${
      isCollapsed ? 'w-16' : 'w-64'
    }`}>
      {/* Toggle Button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        {!isCollapsed && (
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Menu</h2>
        )}
        <button
          onClick={toggleSidebar}
          className="ml-auto p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Sidebar Items */}
      <div className="flex-1 overflow-y-auto py-4 px-2">
        {sidebarItems.map((item) => {
          const isActive = pathname?.startsWith(item.href) || false
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg mb-2 transition-colors ${
                isCollapsed 
                  ? 'w-12 h-12 justify-center mx-auto' 
                  : 'w-full px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!isCollapsed && (
                <span className="text-sm font-medium truncate">{item.label}</span>
              )}
            </Link>
          )
        })}
      </div>
      {/* User Avatar */}
      <div className={`mt-auto mb-4 relative ${isCollapsed ? 'px-2' : 'px-3'}`} ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex items-center gap-3 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800 ${
            isCollapsed 
              ? 'w-12 h-12 justify-center mx-auto rounded-full' 
              : 'w-full px-3 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          style={isCollapsed ? { backgroundColor: 'var(--primary-color)' } : undefined}
          title={isCollapsed ? (user?.username || 'User') : undefined}
        >
          <div 
            className={`flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 ${
              isCollapsed ? 'w-12 h-12' : 'w-10 h-10'
            }`}
            style={{ backgroundColor: 'var(--primary-color)' }}
          >
            {getUserInitials()}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user?.username || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                Signed in
              </p>
            </div>
          )}
        </button>
        
        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className={`absolute bottom-16 mb-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 ${
            isCollapsed ? 'left-0 w-48' : 'left-3 right-3'
          }`}>
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

