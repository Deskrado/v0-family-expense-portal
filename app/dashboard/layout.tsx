'use client'

import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { DashboardProvider, useDashboard } from '@/components/dashboard/dashboard-context'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { currentMonth, currentYear, setMonthYear } = useDashboard()
  const [email, setEmail] = useState<string>()

  useEffect(() => {
    async function getUser() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setEmail(user?.email)
    }
    getUser()
  }, [])

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          email={email}
          currentMonth={currentMonth}
          currentYear={currentYear}
          onMonthYearChange={setMonthYear}
        />
        <main className="flex-1 overflow-auto p-3 pb-24 sm:p-4 md:p-6 md:pb-6">
          {children}
        </main>
      </div>
    </div>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DashboardProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </DashboardProvider>
  )
}
