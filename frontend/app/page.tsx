'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Home() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  
  useEffect(() => {
    if (isAuthenticated) {
      // Redirect to cases list page if authenticated
      router.push('/cases')
    } else {
      // Redirect to sign-in if not authenticated
      router.push('/signin')
    }
  }, [router, isAuthenticated])
  
  return (
    <div className="p-6 flex items-center justify-center min-h-screen">
      <div className="text-gray-600">Loading...</div>
    </div>
  )
}

