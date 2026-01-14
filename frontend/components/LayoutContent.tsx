'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Sidebar from '@/components/Sidebar'
import CaseHeader from '@/components/CaseHeader'
import CommonHeader from '@/components/CommonHeader'

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  
  // Don't show sidebar/header on sign-in page
  const isSignInPage = pathname === '/signin'
  
  // Check if we're on a case-related page
  const isCasePage = pathname?.startsWith('/cases/') || false

  // Redirect unauthenticated users trying to access protected routes
  useEffect(() => {
    if (!isSignInPage && !isAuthenticated) {
      router.push('/signin')
    }
  }, [isAuthenticated, isSignInPage, router])

  if (isSignInPage) {
    return <>{children}</>
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Redirecting to sign in...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="ml-16 flex-1 flex flex-col">
        {isCasePage ? <CaseHeader /> : <CommonHeader />}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}

