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
    <div className="fixed left-0 top-0 h-screen w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
      {sidebarItems.map((item) => {
        const isActive = pathname?.startsWith(item.href) || false
        return (
          <Link
            key={item.label}
            href={item.href}
            className={`w-12 h-12 flex items-center justify-center rounded-lg mb-2 transition-colors ${
              isActive
                ? 'bg-purple-100 text-purple-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </Link>
        )
      })}
      <div className="mt-auto mb-4">
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white font-semibold">
          ML
        </div>
      </div>
    </div>
  )
}

