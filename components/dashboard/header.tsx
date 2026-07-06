'use client'

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

  const handleSignOut = () => {
    window.location.href = '/auth/logout'
  }

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 sm:px-4 md:px-6">
      <div className="min-w-0 flex-1">
        <MonthYearSelector 
          month={currentMonth} 
          year={currentYear} 
          onChange={onMonthYearChange}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="px-2 sm:px-3">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Agregar</span>
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
              <p className="max-w-[220px] truncate text-sm font-medium">{email || 'Usuario'}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
