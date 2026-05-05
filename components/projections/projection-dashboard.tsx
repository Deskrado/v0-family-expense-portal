"use client"

import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import {
  useCreditCardPurchases,
  useCurrencies,
  useYearlyTransactions,
} from "@/components/dashboard/use-dashboard-data"
import { formatCurrency, getMonthName } from "@/lib/currency"
import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Loader2 } from "lucide-react"

export function ProjectionDashboard() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { data: yearlyTransactions, isLoading: transactionsLoading } = useYearlyTransactions()
  const { data: purchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: currencies } = useCurrencies()
  const currency = currencies?.find((item) => item.code === "ARS") || currencies?.[0] || null
  const isLoading = transactionsLoading || purchasesLoading

  const monthlyData = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const monthData = { month, year: selectedYear, income: 0, expenses: 0, installments: 0, savings: 0 }

    yearlyTransactions?.forEach((transaction) => {
      if (getMonthIndexFromDateOnly(transaction.transaction_date) === index) {
        const projectedAmount = transaction.status === "rejected" ? 0 : Number(transaction.amount)
        if (transaction.type === "income") {
          monthData.income += projectedAmount
        } else {
          monthData.expenses += projectedAmount
        }
      }
    })

    purchases?.forEach((purchase) => {
      const startMonthIndex = getMonthIndexFromDateOnly(purchase.start_date)
      const startYear = getYearFromDateOnly(purchase.start_date)
      const monthsSinceStart = (selectedYear - startYear) * 12 + index - startMonthIndex
      if (monthsSinceStart >= 0 && monthsSinceStart < purchase.total_installments) {
        monthData.installments += Number(purchase.installment_amount)
      }
    })

    monthData.expenses += monthData.installments
    monthData.savings = monthData.income - monthData.expenses
    return monthData
  })

  const projectedTotal = monthlyData.slice(selectedMonth - 1).reduce((total, item) => total + item.savings, 0)
  const installmentsTotal = monthlyData.reduce((total, item) => total + item.installments, 0)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ahorro proyectado restante</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-bold font-mono ${projectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(projectedTotal, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cuotas del año</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {formatCurrency(installmentsTotal, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Compras activas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {purchases?.length || 0}
          </CardContent>
        </Card>
      </div>

      <AnnualProjectionChart
        data={monthlyData}
        currentMonth={selectedMonth}
        currentYear={selectedYear}
        currency={currency}
      />

      <Card>
        <CardHeader>
          <CardTitle>Detalle mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Gastos</TableHead>
                  <TableHead className="text-right">Cuotas</TableHead>
                  <TableHead className="text-right">Ahorro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((item) => (
                  <TableRow key={item.month}>
                    <TableCell className="font-medium">{getMonthName(item.month)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.income, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.expenses, currency)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(item.installments, currency)}</TableCell>
                    <TableCell className={`text-right font-mono ${item.savings >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(item.savings, currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
