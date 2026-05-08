"use client"

import { useState } from "react"
import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import {
  useCategories,
  useCreditCardPurchases,
  useCurrencies,
  useRecurringIncomeTemplates,
  useYearlyTransactions,
} from "@/components/dashboard/use-dashboard-data"
import { formatCurrency, getMonthName } from "@/lib/currency"
import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"
import { getRecurringProjectionForMonth } from "@/lib/recurring-projection"
import { getCreditCardInstallmentDueDate } from "@/lib/credit-card-billing"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Loader2, Plus, Trash2 } from "lucide-react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts"

type ScenarioItem = {
  id: string
  name: string
  amount: number
  frequency: "monthly" | "one_time"
  startMonth: number
  endMonth: number
}

type ScenarioForm = {
  name: string
  amount: string
  frequency: "monthly" | "one_time"
  startMonth: string
  endMonth: string
}

export function ProjectionDashboard() {
  const { selectedMonth, selectedYear } = useDashboard()
  const [scenarioItems, setScenarioItems] = useState<ScenarioItem[]>([])
  const [scenarioForm, setScenarioForm] = useState<ScenarioForm>({
    name: "",
    amount: "",
    frequency: "monthly",
    startMonth: String(selectedMonth),
    endMonth: "12",
  })
  const { data: yearlyTransactions, isLoading: transactionsLoading } = useYearlyTransactions()
  const { data: purchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: recurringIncomeTemplates } = useRecurringIncomeTemplates()
  const { data: categories } = useCategories()
  const { data: currencies } = useCurrencies()
  const currency = currencies?.find((item) => item.code === "ARS") || currencies?.[0] || null
  const isLoading = transactionsLoading || purchasesLoading
  const projectedCategories = (categories || []).filter(
    (category) => category.type === "expense" && category.projection_method === "historical_average",
  )
  const projectedCategoryNames = new Map(projectedCategories.map((category) => [category.id, category.name]))

  const getHistoricalAverageForCategory = (categoryId: string, targetYear: number, targetMonthIndex: number, monthsBack: number) => {
    const targetIndex = targetYear * 12 + targetMonthIndex
    const windowMonthlyTotals = new Map<number, number>()
    const previousMonthlyTotals = new Map<number, number>()

    for (const transaction of yearlyTransactions || []) {
      if (transaction.status === "rejected") continue
      if (transaction.type !== "expense") continue
      if (transaction.is_recurring) continue
      if (transaction.credit_card_purchase_id) continue
      if (transaction.category_id !== categoryId) continue

      const amount = Number(transaction.amount || 0)
      if (amount <= 0) continue

      const transactionIndex = getYearFromDateOnly(transaction.transaction_date) * 12 + getMonthIndexFromDateOnly(transaction.transaction_date)
      if (transactionIndex >= targetIndex) continue

      previousMonthlyTotals.set(transactionIndex, (previousMonthlyTotals.get(transactionIndex) || 0) + amount)
      if (transactionIndex < targetIndex - monthsBack) continue

      windowMonthlyTotals.set(transactionIndex, (windowMonthlyTotals.get(transactionIndex) || 0) + amount)
    }

    const windowValues = Array.from(windowMonthlyTotals.values()).filter((value) => value > 0)
    if (windowValues.length > 0) {
      return windowValues.reduce((total, value) => total + value, 0) / windowValues.length
    }

    const latestMonthWithExpense = Math.max(...Array.from(previousMonthlyTotals.keys()))
    if (!Number.isFinite(latestMonthWithExpense)) return 0
    return previousMonthlyTotals.get(latestMonthWithExpense) || 0
  }

  const monthlyData = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const monthData = { month, year: selectedYear, income: 0, expenses: 0, installments: 0, variableProjection: 0, savings: 0 }
    const monthIndex = selectedYear * 12 + index
    const selectedIndex = selectedYear * 12 + (selectedMonth - 1)
    const categoriesWithActualExpense = new Set<string>()

    yearlyTransactions?.forEach((transaction) => {
      if (getYearFromDateOnly(transaction.transaction_date) === selectedYear && getMonthIndexFromDateOnly(transaction.transaction_date) === index) {
        const projectedAmount = transaction.status === "rejected" ? 0 : Number(transaction.amount)
        if (transaction.type === "income") {
          monthData.income += projectedAmount
        } else {
          monthData.expenses += projectedAmount
          if (transaction.category_id && projectedCategoryNames.has(transaction.category_id)) {
            categoriesWithActualExpense.add(transaction.category_id)
          }
        }
      }
    })

    const recurringProjection = getRecurringProjectionForMonth(yearlyTransactions, selectedYear, index, selectedYear, selectedMonth, recurringIncomeTemplates)
    monthData.income += recurringProjection.income
    monthData.expenses += recurringProjection.expenses

    purchases?.forEach((purchase) => {
      for (let installmentIndex = 0; installmentIndex < purchase.total_installments; installmentIndex += 1) {
        const installmentDueDate = getCreditCardInstallmentDueDate(purchase.start_date, purchase.credit_card, installmentIndex)
        if (getYearFromDateOnly(installmentDueDate) !== selectedYear || getMonthIndexFromDateOnly(installmentDueDate) !== index) continue

        const hasCurrentTransaction = (purchase.transactions || []).some(
          (transaction) => Number(transaction.installment_number || 0) === installmentIndex + 1,
        )
        if (hasCurrentTransaction) return
        monthData.installments += Number(purchase.installment_amount)
      }
    })

    monthData.expenses += monthData.installments

    if (monthIndex > selectedIndex) {
      for (const category of projectedCategories) {
        if (categoriesWithActualExpense.has(category.id)) continue

        const average = getHistoricalAverageForCategory(
          category.id,
          selectedYear,
          index,
          Math.max(Number(category.projection_months || 3), 1),
        )
        monthData.variableProjection += average
        monthData.expenses += average
      }
    }

    monthData.savings = monthData.income - monthData.expenses
    return monthData
  })
  const getScenarioImpactForMonth = (month: number) =>
    scenarioItems.reduce((total, item) => {
      if (item.frequency === "one_time") {
        return item.startMonth === month ? total + item.amount : total
      }

      return month >= item.startMonth && month <= item.endMonth ? total + item.amount : total
    }, 0)

  const simulatedMonthlyData = monthlyData.map((item) => {
    const scenarioImpact = getScenarioImpactForMonth(item.month)
    return {
      ...item,
      scenarioImpact,
      simulatedExpenses: item.expenses + scenarioImpact,
      simulatedSavings: item.savings - scenarioImpact,
    }
  })

  const projectedTotal = monthlyData.reduce((total, item) => total + item.savings, 0)
  const projectedExpensesTotal = monthlyData.reduce((total, item) => total + item.expenses, 0)
  const essentialProjectionTotal = monthlyData.reduce((total, item) => total + item.variableProjection, 0)
  const scenarioImpactTotal = simulatedMonthlyData.reduce((total, item) => total + item.scenarioImpact, 0)
  const simulatedProjectedTotal = projectedTotal - scenarioImpactTotal
  const months = Array.from({ length: 12 }, (_, index) => index + 1)
  const simulationChartData = simulatedMonthlyData.map((item) => ({
    name: getMonthName(item.month, true),
    baseExpenses: item.expenses,
    simulatedExpenses: item.simulatedExpenses,
  }))
  const formatCompactValue = (value: number) => {
    const absoluteValue = Math.abs(value)
    if (absoluteValue >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (absoluteValue >= 1000) return `${(value / 1000).toFixed(0)}K`
    return value.toString()
  }

  const addScenarioItem = () => {
    const amount = Number(scenarioForm.amount)
    const startMonth = Number(scenarioForm.startMonth)
    const endMonth = scenarioForm.frequency === "one_time" ? startMonth : Number(scenarioForm.endMonth)

    if (!scenarioForm.name.trim() || !Number.isFinite(amount) || amount <= 0) return
    if (startMonth < 1 || startMonth > 12 || endMonth < startMonth || endMonth > 12) return

    setScenarioItems((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        name: scenarioForm.name.trim(),
        amount,
        frequency: scenarioForm.frequency,
        startMonth,
        endMonth,
      },
    ])
    setScenarioForm({
      name: "",
      amount: "",
      frequency: scenarioForm.frequency,
      startMonth: scenarioForm.startMonth,
      endMonth: scenarioForm.endMonth,
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ahorro proyectado del año</CardTitle>
          </CardHeader>
          <CardContent className={`font-mono text-xl font-bold sm:text-2xl ${projectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(projectedTotal, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Gastos proyectados</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl font-bold sm:text-2xl">
            {formatCurrency(projectedExpensesTotal, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Esenciales estimados</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl font-bold sm:text-2xl">
            {formatCurrency(essentialProjectionTotal, currency)}
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
          <CardTitle>Simulador de escenario</CardTitle>
          <p className="text-sm text-muted-foreground">
            Probá gastos hipotéticos sin registrarlos como transacciones reales.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(180px,1fr)_160px_160px_150px_150px_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                placeholder="Ej: Seguro auto"
                value={scenarioForm.name}
                onChange={(event) => setScenarioForm({ ...scenarioForm, name: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Monto</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={scenarioForm.amount}
                onChange={(event) => setScenarioForm({ ...scenarioForm, amount: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Frecuencia</Label>
              <Select
                value={scenarioForm.frequency}
                onValueChange={(value) => setScenarioForm({
                  ...scenarioForm,
                  frequency: value as ScenarioForm["frequency"],
                  endMonth: value === "one_time" ? scenarioForm.startMonth : scenarioForm.endMonth,
                })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="one_time">Único</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Desde</Label>
              <Select value={scenarioForm.startMonth} onValueChange={(value) => setScenarioForm({ ...scenarioForm, startMonth: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={String(month)}>
                      {getMonthName(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Hasta</Label>
              <Select
                value={scenarioForm.frequency === "one_time" ? scenarioForm.startMonth : scenarioForm.endMonth}
                disabled={scenarioForm.frequency === "one_time"}
                onValueChange={(value) => setScenarioForm({ ...scenarioForm, endMonth: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month) => (
                    <SelectItem key={month} value={String(month)}>
                      {getMonthName(month)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="button" className="w-full lg:w-auto" onClick={addScenarioItem}>
              <Plus className="mr-2 h-4 w-4" />
              Agregar
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Impacto del escenario</p>
              <p className="font-mono text-xl font-semibold text-destructive">{formatCurrency(scenarioImpactTotal, currency)}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Ahorro base</p>
              <p className={`font-mono text-xl font-semibold ${projectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(projectedTotal, currency)}
              </p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Ahorro con escenario</p>
              <p className={`font-mono text-xl font-semibold ${simulatedProjectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
                {formatCurrency(simulatedProjectedTotal, currency)}
              </p>
            </div>
          </div>

          {scenarioItems.length > 0 && (
            <div className="space-y-2">
              {scenarioItems.map((item) => (
                <div key={item.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.frequency === "monthly" ? "Mensual" : "Único"} · {getMonthName(item.startMonth)}
                      {item.frequency === "monthly" ? ` a ${getMonthName(item.endMonth)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <p className="font-mono font-semibold">{formatCurrency(item.amount, currency)}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setScenarioItems((current) => current.filter((candidate) => candidate.id !== item.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Gasto simulado</TableHead>
                    <TableHead className="text-right">Ahorro</TableHead>
                    <TableHead className="text-right">Ahorro sim.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simulatedMonthlyData.map((item) => (
                    <TableRow key={item.month}>
                      <TableCell className="font-medium">{getMonthName(item.month)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.income, currency)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.variableProjection > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex cursor-help border-b border-dotted border-muted-foreground/70">
                                {formatCurrency(item.expenses, currency)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent align="end">
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between gap-6">
                                  <span>Gasto total</span>
                                  <span className="font-mono">{formatCurrency(item.expenses, currency)}</span>
                                </div>
                                <div className="flex justify-between gap-6">
                                  <span>Esencial estimado</span>
                                  <span className="font-mono">{formatCurrency(item.variableProjection, currency)}</span>
                                </div>
                                <p className="max-w-64 text-xs text-muted-foreground">
                                  Promedio histórico incluido en meses futuros hasta que exista un gasto real en esta categoría.
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          formatCurrency(item.expenses, currency)
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.simulatedExpenses, currency)}</TableCell>
                      <TableCell className={`text-right font-mono ${item.savings >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(item.savings, currency)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${item.simulatedSavings >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(item.simulatedSavings, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curva de gastos</CardTitle>
          <p className="text-sm text-muted-foreground">
            Comparación entre el gasto proyectado base y el gasto total con escenario.
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={simulationChartData} margin={{ top: 12, right: 24, left: 12, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis
                  tickFormatter={formatCompactValue}
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                  width={54}
                />
                <ChartTooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  labelFormatter={(label) => `Mes: ${label}`}
                />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                <Line
                  type="linear"
                  dataKey="baseExpenses"
                  name="Gasto base"
                  stroke="#dc2626"
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="linear"
                  dataKey="simulatedExpenses"
                  name="Gasto simulado"
                  stroke="#2563eb"
                  strokeWidth={4}
                  dot={{ r: 4, strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
