'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Settings, Folder, Users, Check, FileText, HelpCircle, Home } from 'lucide-react'

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
      <div className="mt-auto mb-4">
        <div className="w-12 h-12 flex items-center justify-center rounded-full text-white font-semibold" style={{ backgroundColor: 'var(--primary-color)' }}>
          // user avatar with option sign out
          
        </div>
      </div>
    </div>
  )
}

