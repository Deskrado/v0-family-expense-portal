'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut, Plus } from 'lucide-react'
import { MonthYearSelector } from './month-year-selector'

interface HeaderProps {
  email?: string
  currentMonth: number
  currentYear: number
  onMonthYearChange: (month: number, year: number) => void
}

export function Header({ email, currentMonth, currentYear, onMonthYearChange }: HeaderProps) {
  const router = useRouter()

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card">
      <div className="flex items-center gap-4">
        <MonthYearSelector 
          month={currentMonth} 
          year={currentYear} 
          onChange={onMonthYearChange}
        />
      </div>

      <div className="flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Agregar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push('/dashboard/transacciones/nuevo?type=expense')}>
              Nuevo Gasto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push('/dashboard/transacciones/nuevo?type=income')}>
              Nuevo Ingreso
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/tarjetas/compra')}>
              Compra en Cuotas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <User className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{email || 'Usuario'}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
