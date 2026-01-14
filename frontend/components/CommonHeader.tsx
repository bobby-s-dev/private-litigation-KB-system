'use client'

import { usePathname } from 'next/navigation'

export default function CommonHeader() {
  const pathname = usePathname()

  const getPageTitle = () => {
    if (!pathname) return ''
    
    if (pathname === '/dashboard') return 'Dashboard'
    if (pathname === '/cases') return 'Cases'
    if (pathname === '/entities') return 'Entities'
    if (pathname === '/activity') return 'Activity'
    if (pathname === '/settings') return 'Settings'
    if (pathname === '/tasks') return 'Tasks'
    if (pathname === '/help') return 'Help'
    
    return ''
  }

  const pageTitle = getPageTitle()

  if (!pageTitle) {
    return null
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{pageTitle}</h1>
    </div>
  )
}

