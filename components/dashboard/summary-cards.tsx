'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { Currency } from '@/lib/types'
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SummaryCardsProps {
  initialBalance: number
  finalBalance: number
  totalIncome: number
  totalExpenses: number
  budgetedIncome: number
  budgetedExpenses: number
  savings: number
  currency: Currency | null
}

export function SummaryCards({
  initialBalance,
  finalBalance,
  totalIncome,
  totalExpenses,
  budgetedIncome,
  budgetedExpenses,
  savings,
  currency,
}: SummaryCardsProps) {
  const incomeVariance = totalIncome - budgetedIncome
  const expenseVariance = totalExpenses - budgetedExpenses
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Saldo Inicial
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(initialBalance, currency)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Saldo Final
          </CardTitle>
          <Wallet className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className={cn(
            "text-2xl font-bold",
            finalBalance >= 0 ? "text-success" : "text-destructive"
          )}>
            {formatCurrency(finalBalance, currency)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ingresos del Mes
          </CardTitle>
          <TrendingUp className="h-4 w-4 text-success" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-success">
            {formatCurrency(totalIncome, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Previsto: {formatCurrency(budgetedIncome, currency)}
            <span className={cn(
              "ml-2",
              incomeVariance >= 0 ? "text-success" : "text-destructive"
            )}>
              ({incomeVariance >= 0 ? '+' : ''}{formatCurrency(incomeVariance, currency)})
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Gastos del Mes
          </CardTitle>
          <TrendingDown className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-destructive">
            {formatCurrency(totalExpenses, currency)}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Previsto: {formatCurrency(budgetedExpenses, currency)}
            <span className={cn(
              "ml-2",
              expenseVariance <= 0 ? "text-success" : "text-destructive"
            )}>
              ({expenseVariance > 0 ? '+' : ''}{formatCurrency(expenseVariance, currency)})
            </span>
          </p>
        </CardContent>
      </Card>

      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ahorro del Mes
          </CardTitle>
          <PiggyBank className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-4">
            <span className={cn(
              "text-3xl font-bold",
              savings >= 0 ? "text-success" : "text-destructive"
            )}>
              {formatCurrency(savings, currency)}
            </span>
            <span className="text-sm text-muted-foreground">
              ({savingsRate.toFixed(1)}% de los ingresos)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
