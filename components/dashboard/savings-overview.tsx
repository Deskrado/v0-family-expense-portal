'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { Currency } from '@/lib/types'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface SavingsData {
  currentMonth: number
  previousMonth: number
  monthlyTarget: number
  yearToDate: number
  yearTarget: number
}

interface SavingsOverviewProps {
  data: SavingsData
  currency: Currency | null
}

export function SavingsOverview({ data, currency }: SavingsOverviewProps) {
  const monthlyProgress = data.monthlyTarget > 0 
    ? Math.min((data.currentMonth / data.monthlyTarget) * 100, 100) 
    : 0
  const yearlyProgress = data.yearTarget > 0 
    ? Math.min((data.yearToDate / data.yearTarget) * 100, 100) 
    : 0
  const monthChange = data.previousMonth !== 0 
    ? ((data.currentMonth - data.previousMonth) / Math.abs(data.previousMonth)) * 100 
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resumen de Ahorros</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Ahorro del mes</span>
            <span className={cn(
              "text-lg font-bold",
              data.currentMonth >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(data.currentMonth, currency)}
            </span>
          </div>
          {data.monthlyTarget > 0 && (
            <>
              <Progress value={monthlyProgress} className="h-2" />
              <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                <span>Meta: {formatCurrency(data.monthlyTarget, currency)}</span>
                <span>{monthlyProgress.toFixed(0)}%</span>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Mes anterior</p>
            <p className={cn(
              "text-lg font-semibold",
              data.previousMonth >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(data.previousMonth, currency)}
            </p>
            {data.previousMonth !== 0 && (
              <p className={cn(
                "text-xs",
                monthChange >= 0 ? "text-success" : "text-destructive"
              )}>
                {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(1)}%
              </p>
            )}
          </div>

          <div className="p-3 bg-muted rounded-lg">
            <p className="text-xs text-muted-foreground">Acumulado del ano</p>
            <p className={cn(
              "text-lg font-semibold",
              data.yearToDate >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(data.yearToDate, currency)}
            </p>
            {data.yearTarget > 0 && (
              <p className="text-xs text-muted-foreground">
                Meta: {formatCurrency(data.yearTarget, currency)}
              </p>
            )}
          </div>
        </div>

        {data.yearTarget > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">Progreso anual</span>
              <span className="text-sm font-medium">{yearlyProgress.toFixed(0)}%</span>
            </div>
            <Progress value={yearlyProgress} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
