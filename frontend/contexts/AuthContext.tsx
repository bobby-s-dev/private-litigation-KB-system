'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useRouter } from 'next/navigation'

interface User {
  username: string
  password: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (username: string, password: string) => boolean
  logout: () => void
  updateCredentials: (username: string, password: string) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'password'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Check if user is authenticated on mount
    const storedUser = localStorage.getItem('user')
    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setUser(parsedUser)
      } catch (error) {
        console.error('Error parsing stored user:', error)
        localStorage.removeItem('user')
      }
    }
    setIsLoading(false)
  }, [])

  const login = (username: string, password: string): boolean => {
    // Check against stored credentials or defaults
    const storedUser = localStorage.getItem('user')
    let validUser: User | null = null

    if (storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        if (parsedUser.username === username && parsedUser.password === password) {
          validUser = parsedUser
        }
      } catch (error) {
        console.error('Error parsing stored user:', error)
      }
    } else {
      // Check against default credentials
      if (username === DEFAULT_USERNAME && password === DEFAULT_PASSWORD) {
        validUser = { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }
      }
    }

    if (validUser) {
      setUser(validUser)
      localStorage.setItem('user', JSON.stringify(validUser))
      return true
    }

    return false
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('user')
    router.push('/signin')
  }

  const updateCredentials = (username: string, password: string) => {
    const updatedUser = { username, password }
    setUser(updatedUser)
    localStorage.setItem('user', JSON.stringify(updatedUser))
  }

  // Don't render children until we've checked authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        updateCredentials,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

