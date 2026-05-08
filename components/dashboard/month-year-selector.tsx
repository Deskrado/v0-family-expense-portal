'use client'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { getMonthName } from '@/lib/currency'

interface MonthYearSelectorProps {
  month: number
  year: number
  onChange: (month: number, year: number) => void
}

export function MonthYearSelector({ month, year, onChange }: MonthYearSelectorProps) {
  const handlePrevMonth = () => {
    if (month === 1) {
      onChange(12, year - 1)
    } else {
      onChange(month - 1, year)
    }
  }

  const handleNextMonth = () => {
    if (month === 12) {
      onChange(1, year + 1)
    } else {
      onChange(month + 1, year)
    }
  }

  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const years = Array.from({ length: 10 }, (_, i) => year - 5 + i)

  return (
    <div className="flex min-w-0 items-center gap-1 sm:gap-2">
      <Button variant="ghost" size="icon-sm" onClick={handlePrevMonth} className="shrink-0">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="min-w-0 max-w-[170px] flex-1 px-2 sm:min-w-[180px] sm:px-4">
            <Calendar className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">{getMonthName(month)} {year}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-64">
          <div className="grid grid-cols-3 gap-1 p-2">
            {months.map((m) => (
              <DropdownMenuItem
                key={m}
                className="justify-center"
                onClick={() => onChange(m, year)}
              >
                {getMonthName(m, true)}
              </DropdownMenuItem>
            ))}
          </div>
          <div className="border-t border-border p-2">
            <div className="flex flex-wrap gap-1 justify-center">
              {years.map((y) => (
                <Button
                  key={y}
                  variant={y === year ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => onChange(month, y)}
                >
                  {y}
                </Button>
              ))}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon-sm" onClick={handleNextMonth} className="shrink-0">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
