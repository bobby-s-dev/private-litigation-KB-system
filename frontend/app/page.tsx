'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  
  useEffect(() => {
    // Redirect to cases list page
    router.push('/cases')
  }, [router])
  
  return (
    <div className="p-6 flex items-center justify-center min-h-screen">
      <div className="text-gray-600">Loading...</div>
    </div>
  )
}

