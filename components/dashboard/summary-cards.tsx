'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/currency'
import { Currency } from '@/lib/types'
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WealthBreakdown } from '@/lib/wealth-summary'

interface SummaryCardsProps {
  initialBalance: number
  finalBalance: number
  totalIncome: number
  totalExpenses: number
  budgetedIncome: number
  budgetedExpenses: number
  savings: number
  currency: Currency | null
  wealth?: WealthBreakdown
  showInvestments?: boolean
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
  wealth,
  showInvestments = true,
}: SummaryCardsProps) {
  const incomeVariance = totalIncome - budgetedIncome
  const expenseVariance = totalExpenses - budgetedExpenses
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0
  const consolidatedLabel = showInvestments ? "Cash + divisas + inversiones" : "Cash + divisas"
  const consolidatedTotal = wealth
    ? showInvestments
      ? wealth.total
      : wealth.cash + wealth.foreignCurrencies
    : 0

  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Saldo Inicial
          </CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="break-words text-xl font-bold sm:text-2xl">{formatCurrency(initialBalance, currency)}</div>
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
            "break-words text-xl font-bold sm:text-2xl",
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
          <div className="break-words text-xl font-bold text-success sm:text-2xl">
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
          <div className="break-words text-xl font-bold text-destructive sm:text-2xl">
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

      {wealth && (
        <Card className="md:col-span-2 lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Consolidado
            </CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={cn(
              "grid gap-4",
              showInvestments ? "md:grid-cols-[1.4fr_1fr_1fr_1fr]" : "md:grid-cols-[1.4fr_1fr_1fr]",
            )}>
              <div>
                <p className="text-xs text-muted-foreground">{consolidatedLabel}</p>
                <p className={cn(
                  "mt-1 break-words text-2xl font-bold font-mono sm:text-3xl",
                  consolidatedTotal >= 0 ? "text-success" : "text-destructive"
                )}>
                  {formatCurrency(consolidatedTotal, currency)}
                </p>
              </div>
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Cash</p>
                <p className="mt-1 font-semibold font-mono">{formatCurrency(wealth.cash, currency)}</p>
              </div>
              {showInvestments && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Inversiones</p>
                  <p className="mt-1 font-semibold font-mono">{formatCurrency(wealth.investments, currency)}</p>
                </div>
              )}
              <div className="rounded-md bg-muted p-3">
                <p className="text-xs text-muted-foreground">Divisas</p>
                <p className="mt-1 font-semibold font-mono">{formatCurrency(wealth.foreignCurrencies, currency)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="md:col-span-2 lg:col-span-4">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Ahorro del Mes
          </CardTitle>
          <PiggyBank className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-3 sm:gap-4">
            <span className={cn(
              "break-words text-2xl font-bold sm:text-3xl",
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
