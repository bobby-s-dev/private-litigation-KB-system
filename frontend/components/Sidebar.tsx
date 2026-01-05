'use client'

import { useState } from 'react'
import Link from 'next/link'

const sidebarItems = [
  { icon: '📊', label: 'Dashboard', href: '/dashboard' },
  { icon: '📁', label: 'Cases', href: '/cases', active: true },
  { icon: '👥', label: 'Entities', href: '/entities' },
  { icon: '✓', label: 'Tasks', href: '/tasks' },
  { icon: '📝', label: 'Activity', href: '/activity' },
  { icon: '❓', label: 'Help', href: '/help' },
]

export default function Sidebar() {
  return (
    <div className="fixed left-0 top-0 h-screen w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4">
      {sidebarItems.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`w-12 h-12 flex items-center justify-center rounded-lg mb-2 transition-colors ${
            item.active
              ? 'bg-purple-100 text-purple-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
          title={item.label}
        >
          <span className="text-xl">{item.icon}</span>
        </Link>
      ))}
      <div className="mt-auto mb-4">
        <div className="w-12 h-12 flex items-center justify-center rounded-full bg-purple-600 text-white font-semibold">
          ML
        </div>
      </div>
    </div>
  )
}

