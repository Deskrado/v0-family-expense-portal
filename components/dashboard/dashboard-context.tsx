'use client'

import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { getCurrentMonth, getCurrentYear } from '@/lib/currency'

interface DashboardContextType {
  currentMonth: number
  currentYear: number
  selectedMonth: number
  selectedYear: number
  setMonthYear: (month: number, year: number) => void
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}

interface DashboardProviderProps {
  children: ReactNode
}

export function DashboardProvider({ children }: DashboardProviderProps) {
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentYear, setCurrentYear] = useState(getCurrentYear())

  const setMonthYear = useCallback((month: number, year: number) => {
    setCurrentMonth(month)
    setCurrentYear(year)
  }, [])

  return (
    <DashboardContext.Provider
      value={{
        currentMonth,
        currentYear,
        selectedMonth: currentMonth,
        selectedYear: currentYear,
        setMonthYear,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}
