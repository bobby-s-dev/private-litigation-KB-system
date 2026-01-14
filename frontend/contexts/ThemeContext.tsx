'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  primaryColor: string
  setTheme: (theme: Theme) => void
  setPrimaryColor: (color: string) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const DEFAULT_PRIMARY_COLOR = 'rgb(124 58 237)' // purple-600
const DEFAULT_THEME: Theme = 'light'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME)
  const [primaryColor, setPrimaryColorState] = useState<string>(DEFAULT_PRIMARY_COLOR)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load theme and color from localStorage
    const storedTheme = localStorage.getItem('theme') as Theme | null
    const storedColor = localStorage.getItem('primaryColor')
    
    if (storedTheme && (storedTheme === 'light' || storedTheme === 'dark')) {
      setThemeState(storedTheme)
    }
    
    if (storedColor) {
      setPrimaryColorState(storedColor)
    }
    
    setIsLoading(false)
  }, [])

  useEffect(() => {
    // Apply theme to document
    if (!isLoading) {
      const root = document.documentElement
      
      // Apply theme class
      if (theme === 'dark') {
        root.classList.add('dark')
      } else {
        root.classList.remove('dark')
      }
      
      // Apply primary color as CSS variable
      root.style.setProperty('--primary-color', primaryColor)
      
      // Calculate color variations for the primary color
      const rgb = parseRgb(primaryColor)
      if (rgb) {
        // Generate lighter and darker variations
        const lighter = `rgb(${Math.min(255, rgb.r + 30)} ${Math.min(255, rgb.g + 30)} ${Math.min(255, rgb.b + 30)})`
        const darker = `rgb(${Math.max(0, rgb.r - 30)} ${Math.max(0, rgb.g - 30)} ${Math.max(0, rgb.b - 30)})`
        
        root.style.setProperty('--primary-color-light', lighter)
        root.style.setProperty('--primary-color-dark', darker)
      }
    }
  }, [theme, primaryColor, isLoading])

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('theme', newTheme)
  }

  const setPrimaryColor = (color: string) => {
    setPrimaryColorState(color)
    localStorage.setItem('primaryColor', color)
  }

  // Helper function to parse RGB string
  const parseRgb = (rgbString: string): { r: number; g: number; b: number } | null => {
    const match = rgbString.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/)
    if (match) {
      return {
        r: parseInt(match[1], 10),
        g: parseInt(match[2], 10),
        b: parseInt(match[3], 10),
      }
    }
    return null
  }

  if (isLoading) {
    return <>{children}</>
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        primaryColor,
        setTheme,
        setPrimaryColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

