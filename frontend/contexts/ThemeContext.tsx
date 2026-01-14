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
        // Generate color scale (similar to Tailwind's 50-900 scale)
        // 50: very light (almost white with tint)
        const color50 = `rgb(${Math.min(255, Math.round(255 - (255 - rgb.r) * 0.95))} ${Math.min(255, Math.round(255 - (255 - rgb.g) * 0.95))} ${Math.min(255, Math.round(255 - (255 - rgb.b) * 0.95))})`
        // 100: light
        const color100 = `rgb(${Math.min(255, Math.round(255 - (255 - rgb.r) * 0.9))} ${Math.min(255, Math.round(255 - (255 - rgb.g) * 0.9))} ${Math.min(255, Math.round(255 - (255 - rgb.b) * 0.9))})`
        // 200: lighter
        const color200 = `rgb(${Math.min(255, Math.round(255 - (255 - rgb.r) * 0.8))} ${Math.min(255, Math.round(255 - (255 - rgb.g) * 0.8))} ${Math.min(255, Math.round(255 - (255 - rgb.b) * 0.8))})`
        // 300: light-medium
        const color300 = `rgb(${Math.min(255, Math.round(255 - (255 - rgb.r) * 0.7))} ${Math.min(255, Math.round(255 - (255 - rgb.g) * 0.7))} ${Math.min(255, Math.round(255 - (255 - rgb.b) * 0.7))})`
        // 400: medium-light
        const color400 = `rgb(${Math.min(255, Math.round(255 - (255 - rgb.r) * 0.5))} ${Math.min(255, Math.round(255 - (255 - rgb.g) * 0.5))} ${Math.min(255, Math.round(255 - (255 - rgb.b) * 0.5))})`
        // 500: base (primary color)
        const color500 = primaryColor
        // 600: medium-dark (slightly darker)
        const color600 = `rgb(${Math.max(0, Math.round(rgb.r * 0.9))} ${Math.max(0, Math.round(rgb.g * 0.9))} ${Math.max(0, Math.round(rgb.b * 0.9))})`
        // 700: dark
        const color700 = `rgb(${Math.max(0, Math.round(rgb.r * 0.8))} ${Math.max(0, Math.round(rgb.g * 0.8))} ${Math.max(0, Math.round(rgb.b * 0.8))})`
        // 800: darker
        const color800 = `rgb(${Math.max(0, Math.round(rgb.r * 0.7))} ${Math.max(0, Math.round(rgb.g * 0.7))} ${Math.max(0, Math.round(rgb.b * 0.7))})`
        // 900: very dark
        const color900 = `rgb(${Math.max(0, Math.round(rgb.r * 0.6))} ${Math.max(0, Math.round(rgb.g * 0.6))} ${Math.max(0, Math.round(rgb.b * 0.6))})`
        
        root.style.setProperty('--primary-50', color50)
        root.style.setProperty('--primary-100', color100)
        root.style.setProperty('--primary-200', color200)
        root.style.setProperty('--primary-300', color300)
        root.style.setProperty('--primary-400', color400)
        root.style.setProperty('--primary-500', color500)
        root.style.setProperty('--primary-600', color600)
        root.style.setProperty('--primary-700', color700)
        root.style.setProperty('--primary-800', color800)
        root.style.setProperty('--primary-900', color900)
        
        // Legacy support
        root.style.setProperty('--primary-color-light', color100)
        root.style.setProperty('--primary-color-dark', color700)
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

