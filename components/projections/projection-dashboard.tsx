"use client"

import { useEffect, useMemo, useState } from "react"
import { invalidateCaches } from "@/lib/swr-cache"
import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import {
  useBrokerPositions,
  useCategories,
  useCreditCardPurchases,
  useCurrencies,
  useFxQuotes,
  useGroups,
  useInvestments,
  useMonthlyClosures,
  usePortfolioSnapshots,
  useProjectionScenarios,
  useRecurringIncomeTemplates,
  useSavingsGoals,
  useUserSettings,
  useYearlyTransactions,
} from "@/components/dashboard/use-dashboard-data"
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
import { formatCompactCurrency, formatCurrency, getMonthName } from "@/lib/currency"
import { buildAnnualProjection, getProjectionAlerts } from "@/lib/projection-engine"
import { getWealthBreakdown } from "@/lib/wealth-summary"
import type { ProjectionScenario, ProjectionScenarioItem } from "@/lib/types"
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react"
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type ScenarioForm = {
  name: string
  description: string
}

type ScenarioItemForm = {
  name: string
  amount: string
  frequency: "monthly" | "one_time"
  startMonth: string
  startYear: string
  endMonth: string
  endYear: string
  categoryId: string
  groupId: string
}

type TemplateItem = Pick<ScenarioItemForm, "name" | "amount" | "frequency">

type EditingScenarioItem = {
  scenarioId: string
  itemId: string
}

function addMonths(year: number, month: number, offset: number) {
  const periodIndex = year * 12 + (month - 1) + offset
  return {
    month: (periodIndex % 12) + 1,
    year: Math.floor(periodIndex / 12),
  }
}

const emptyScenarioForm: ScenarioForm = {
  name: "",
  description: "",
}

const templateItems: Record<string, { name: string; description: string; items: TemplateItem[] }> = {
  auto: {
    name: "Compra auto",
    description: "Cuota, seguro, combustible, patente y mantenimiento.",
    items: [
      { name: "Cuota auto", amount: "450000", frequency: "monthly" },
      { name: "Seguro", amount: "90000", frequency: "monthly" },
      { name: "Combustible", amount: "120000", frequency: "monthly" },
      { name: "Patente", amount: "50000", frequency: "monthly" },
      { name: "Mantenimiento", amount: "60000", frequency: "monthly" },
    ],
  },
  vivienda: {
    name: "Cambio vivienda",
    description: "Alquiler o hipoteca, expensas, servicios y mudanza.",
    items: [
      { name: "Alquiler / hipoteca", amount: "900000", frequency: "monthly" },
      { name: "Expensas", amount: "180000", frequency: "monthly" },
      { name: "Servicios", amount: "120000", frequency: "monthly" },
      { name: "Mudanza", amount: "600000", frequency: "one_time" },
    ],
  },
  viaje: {
    name: "Viaje",
    description: "Ahorro mensual previo, pago único y cuotas.",
    items: [
      { name: "Ahorro mensual viaje", amount: "250000", frequency: "monthly" },
      { name: "Reserva / pasajes", amount: "900000", frequency: "one_time" },
      { name: "Cuotas alojamiento", amount: "180000", frequency: "monthly" },
    ],
  },
}

async function fetchJson(path: string, options?: RequestInit) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Error al ejecutar la acción")
  return payload
}

function scenarioItemLabel(item: ProjectionScenarioItem) {
  const start = `${getMonthName(item.start_month, true)} ${item.start_year}`
  if (item.frequency === "one_time") return `Único · ${start}`
  return `Mensual · ${start} a ${getMonthName(item.end_month, true)} ${item.end_year}`
}

export function ProjectionDashboard() {
  const { selectedMonth, selectedYear } = useDashboard()
  const defaultProjectionEnd = addMonths(selectedYear, selectedMonth, 11)
  const [scenarioForm, setScenarioForm] = useState<ScenarioForm>(emptyScenarioForm)
  const [selectedScenarioId, setSelectedScenarioId] = useState("")
  const [editingScenarioItem, setEditingScenarioItem] = useState<EditingScenarioItem | null>(null)
  const [itemForm, setItemForm] = useState<ScenarioItemForm>({
    name: "",
    amount: "",
    frequency: "monthly",
    startMonth: String(selectedMonth),
    startYear: String(selectedYear),
    endMonth: String(defaultProjectionEnd.month),
    endYear: String(defaultProjectionEnd.year),
    categoryId: "__none",
    groupId: "__none",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingScenario, setDeletingScenario] = useState<ProjectionScenario | null>(null)
  const [isDeletingScenario, setIsDeletingScenario] = useState(false)

  useEffect(() => {
    const projectionEnd = addMonths(selectedYear, selectedMonth, 11)
    setItemForm((current) => ({
      ...current,
      startMonth: String(selectedMonth),
      startYear: String(selectedYear),
      endMonth: String(projectionEnd.month),
      endYear: String(projectionEnd.year),
    }))
  }, [selectedMonth, selectedYear])

  const { data: yearlyTransactions, isLoading: transactionsLoading } = useYearlyTransactions()
  const { data: purchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: recurringIncomeTemplates } = useRecurringIncomeTemplates()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: scenarios, isLoading: scenariosLoading } = useProjectionScenarios()
  const { data: closures } = useMonthlyClosures()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()
  const { data: investments } = useInvestments()
  const { data: brokerPositions } = useBrokerPositions()
  const { data: portfolioSnapshots } = usePortfolioSnapshots()
  const { data: savingsGoals } = useSavingsGoals()
  const { data: fxQuotes } = useFxQuotes()
  const currency = settings?.default_currency || currencies?.find((item) => item.code === "ARS") || currencies?.[0] || null
  const months = Array.from({ length: 12 }, (_, index) => index + 1)
  const selectedScenario = (scenarios || []).find((scenario) => scenario.id === selectedScenarioId) || scenarios?.[0] || null
  const isLoading = transactionsLoading || purchasesLoading || scenariosLoading

  const monthlyData = useMemo(() => buildAnnualProjection({
    year: selectedYear,
    selectedMonth,
    startMonth: selectedMonth,
    startYear: selectedYear,
    monthsAhead: 12,
    transactions: yearlyTransactions,
    purchases,
    recurringIncomeTemplates,
    categories,
    scenarios,
  }), [categories, purchases, recurringIncomeTemplates, scenarios, selectedMonth, selectedYear, yearlyTransactions])
  const annualMonthlyData = useMemo(() => buildAnnualProjection({
    year: selectedYear,
    selectedMonth,
    transactions: yearlyTransactions,
    purchases,
    recurringIncomeTemplates,
    categories,
    scenarios,
  }), [categories, purchases, recurringIncomeTemplates, scenarios, selectedMonth, selectedYear, yearlyTransactions])

  const projectedTotal = monthlyData.reduce((total, item) => total + item.savings, 0)
  const projectedExpensesTotal = monthlyData.reduce((total, item) => total + item.expenses, 0)
  const essentialProjectionTotal = monthlyData.reduce((total, item) => total + item.essentialProjection, 0)
  const scenarioImpactTotal = monthlyData.reduce((total, item) => total + item.scenarioImpact, 0)
  const simulatedProjectedTotal = monthlyData.reduce((total, item) => total + item.simulatedSavings, 0)
  const selectedMonthPoint = monthlyData.find((item) => item.year === selectedYear && item.month === selectedMonth) || monthlyData[0]
  const closedMonth = closures?.find((closure) => closure.year === selectedYear && closure.month === selectedMonth) || null
  const alerts = getProjectionAlerts(monthlyData, Number(settings?.notify_budget_threshold || 80))
  const negativeMonthsCount = monthlyData.filter((point) => point.simulatedSavings < 0).length
  const biggestExpenseMonth = monthlyData.reduce((current, item) => item.simulatedExpenses > current.simulatedExpenses ? item : current, monthlyData[0])
  const lowestLiquidityMonth = monthlyData.reduce((current, item) => item.simulatedSavings < current.simulatedSavings ? item : current, monthlyData[0])
  const priorMonthsSavings = annualMonthlyData.slice(0, selectedMonth - 1).reduce((total, item) => total + item.savings, 0)
  const cashBalance = Number(settings?.initial_balance || 0) + priorMonthsSavings + (selectedMonthPoint?.savings || 0)
  const wealth = getWealthBreakdown({
    cashBalance,
    investments,
    brokerPositions,
    portfolioSnapshots,
    savingsGoals,
    fxQuotes,
    defaultCurrency: currency,
  })
  const chartData = monthlyData.map((item) => ({
    name: `${getMonthName(item.month, true)} ${String(item.year).slice(-2)}`,
    baseExpenses: item.expenses,
    simulatedExpenses: item.simulatedExpenses,
  }))
  const calendarData = monthlyData.filter((item) =>
    item.income !== 0 ||
    item.expenses !== 0 ||
    item.simulatedExpenses !== 0 ||
    item.savings !== 0 ||
    item.simulatedSavings !== 0 ||
    item.scenarioImpact !== 0 ||
    item.activeScenarioItems.length > 0
  )

  const refreshProjectionData = () => {
    invalidateCaches(["projection-scenarios", "monthly-closures"])
  }

  const resetItemForm = () => {
    const projectionEnd = addMonths(selectedYear, selectedMonth, 11)
    setEditingScenarioItem(null)
    setItemForm({
      name: "",
      amount: "",
      frequency: "monthly",
      startMonth: String(selectedMonth),
      startYear: String(selectedYear),
      endMonth: String(projectionEnd.month),
      endYear: String(projectionEnd.year),
      categoryId: "__none",
      groupId: "__none",
    })
  }

  const createScenario = async () => {
    if (!scenarioForm.name.trim()) {
      setError("Ingresá un nombre para el escenario")
      return null
    }
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = await fetchJson("/api/projection-scenarios", {
        method: "POST",
        body: JSON.stringify(scenarioForm),
      })
      setScenarioForm(emptyScenarioForm)
      setSelectedScenarioId(payload.scenario.id)
      refreshProjectionData()
      return payload.scenario as ProjectionScenario
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear escenario")
      return null
    } finally {
      setIsSubmitting(false)
    }
  }

  const saveScenarioItem = async () => {
    const scenario = selectedScenario || await createScenario()
    if (!scenario) return

    setIsSubmitting(true)
    setError(null)
    try {
      const itemPath = editingScenarioItem
        ? `/api/projection-scenarios/${editingScenarioItem.scenarioId}/items/${editingScenarioItem.itemId}`
        : `/api/projection-scenarios/${scenario.id}/items`

      await fetchJson(itemPath, {
        method: editingScenarioItem ? "PATCH" : "POST",
        body: JSON.stringify({
          ...itemForm,
          startMonth: Number(itemForm.startMonth),
          startYear: Number(itemForm.startYear),
          endMonth: Number(itemForm.endMonth),
          endYear: Number(itemForm.endYear),
          amount: Number(itemForm.amount),
          categoryId: itemForm.categoryId === "__none" ? null : itemForm.categoryId,
          groupId: itemForm.groupId === "__none" ? null : itemForm.groupId,
          currencyId: currency?.id || null,
        }),
      })
      resetItemForm()
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar ítem")
    } finally {
      setIsSubmitting(false)
    }
  }

  const editScenarioItem = (scenario: ProjectionScenario, item: ProjectionScenarioItem) => {
    setSelectedScenarioId(scenario.id)
    setEditingScenarioItem({ scenarioId: scenario.id, itemId: item.id })
    setItemForm({
      name: item.name,
      amount: String(item.amount),
      frequency: item.frequency,
      startMonth: String(item.start_month),
      startYear: String(item.start_year),
      endMonth: String(item.end_month),
      endYear: String(item.end_year),
      categoryId: item.category_id || "__none",
      groupId: item.group_id || "__none",
    })
  }

  const createTemplate = async (templateKey: keyof typeof templateItems) => {
    const template = templateItems[templateKey]
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = await fetchJson("/api/projection-scenarios", {
        method: "POST",
        body: JSON.stringify({ name: template.name, description: template.description }),
      })
      const scenario = payload.scenario as ProjectionScenario
      await Promise.all(template.items.map((item) =>
        fetchJson(`/api/projection-scenarios/${scenario.id}/items`, {
          method: "POST",
          body: JSON.stringify({
            ...item,
            amount: Number(item.amount),
            startMonth: selectedMonth,
            startYear: selectedYear,
            endMonth: defaultProjectionEnd.month,
            endYear: defaultProjectionEnd.year,
            currencyId: currency?.id || null,
          }),
        })
      ))
      setSelectedScenarioId(scenario.id)
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear template")
    } finally {
      setIsSubmitting(false)
    }
  }

  const toggleScenario = async (scenario: ProjectionScenario) => {
    setError(null)
    try {
      await fetchJson(`/api/projection-scenarios/${scenario.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !scenario.is_active }),
      })
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar escenario")
    }
  }

  const handleDeleteScenario = async () => {
    if (!deletingScenario) return
    const scenario = deletingScenario
    setIsDeletingScenario(true)
    setError(null)
    try {
      await fetchJson(`/api/projection-scenarios/${scenario.id}`, { method: "DELETE" })
      if (selectedScenarioId === scenario.id) setSelectedScenarioId("")
      if (editingScenarioItem?.scenarioId === scenario.id) resetItemForm()
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar escenario")
    } finally {
      setIsDeletingScenario(false)
      setDeletingScenario(null)
    }
  }

  const deleteScenarioItem = async (scenarioId: string, itemId: string) => {
    setError(null)
    try {
      await fetchJson(`/api/projection-scenarios/${scenarioId}/items/${itemId}`, { method: "DELETE" })
      if (editingScenarioItem?.itemId === itemId) resetItemForm()
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar ítem")
    }
  }

  const closeSelectedMonth = async () => {
    if (!selectedMonthPoint) return
    setIsSubmitting(true)
    setError(null)
    try {
      await fetchJson("/api/monthly-closures", {
        method: "POST",
        body: JSON.stringify({
          year: selectedYear,
          month: selectedMonth,
          incomeTotal: selectedMonthPoint.income,
          expenseTotal: selectedMonthPoint.expenses,
          savingsTotal: selectedMonthPoint.savings,
          cashTotal: wealth.cash,
          investmentsTotal: wealth.investments,
          foreignCurrencyTotal: wealth.foreignCurrencies,
          snapshot: {
            projection: selectedMonthPoint,
            wealth,
            closed_from: "projection_dashboard",
          },
        }),
      })
      refreshProjectionData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cerrar mes")
    } finally {
      setIsSubmitting(false)
    }
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
      {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ahorro proyectado base</CardTitle>
          </CardHeader>
          <CardContent className={`font-mono text-xl font-bold sm:text-2xl ${projectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(projectedTotal, currency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ahorro con escenarios</CardTitle>
          </CardHeader>
          <CardContent className={`font-mono text-xl font-bold sm:text-2xl ${simulatedProjectedTotal >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(simulatedProjectedTotal, currency)}
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
            <CardTitle className="text-sm text-muted-foreground">Escenarios activos</CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-xl font-bold sm:text-2xl">
            {formatCurrency(scenarioImpactTotal, currency)}
          </CardContent>
        </Card>
      </div>

      <AnnualProjectionChart
        data={monthlyData}
        currentMonth={selectedMonth}
        currentYear={selectedYear}
        currency={currency}
        title="Proyección a 12 meses"
        description="Ingresos, gastos y ahorro desde el mes en curso"
      />

      <Card>
        <CardHeader>
          <CardTitle>Alertas predictivas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              La proyección no muestra alertas críticas con los escenarios activos.
            </div>
          ) : alerts.map((alert, index) => (
            <div key={index} className={`flex items-center gap-2 rounded-md p-3 text-sm ${alert.level === "danger" ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-700"}`}>
              <AlertTriangle className="h-4 w-4" />
              {alert.message}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulador persistente</CardTitle>
          <p className="text-sm text-muted-foreground">Guardá escenarios para comparar decisiones grandes sin registrar gastos falsos.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-end">
            <div className="min-w-0 space-y-2">
              <Label>Nuevo escenario</Label>
              <Input
                placeholder="Ej: Compra auto"
                value={scenarioForm.name}
                onChange={(event) => setScenarioForm({ ...scenarioForm, name: event.target.value })}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Descripción</Label>
              <Input
                placeholder="Contexto opcional"
                value={scenarioForm.description}
                onChange={(event) => setScenarioForm({ ...scenarioForm, description: event.target.value })}
              />
            </div>
            <Button type="button" className="w-full md:col-span-2 xl:col-span-1 xl:w-auto" onClick={createScenario} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Crear
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(templateItems).map(([key, template]) => (
              <Button key={key} type="button" variant="outline" onClick={() => createTemplate(key as keyof typeof templateItems)} disabled={isSubmitting}>
                {template.name}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12 xl:items-end">
            <div className="min-w-0 space-y-2 xl:col-span-2">
              <Label>Escenario</Label>
              <Select value={selectedScenario?.id || ""} onValueChange={setSelectedScenarioId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {(scenarios || []).map((scenario) => (
                    <SelectItem key={scenario.id} value={scenario.id}>{scenario.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-3">
              <Label>Concepto</Label>
              <Input value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} placeholder="Ej: Seguro" />
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-2">
              <Label>Monto</Label>
              <Input type="number" step="0.01" value={itemForm.amount} onChange={(event) => setItemForm({ ...itemForm, amount: event.target.value })} placeholder="0.00" />
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-2">
              <Label>Frecuencia</Label>
              <Select value={itemForm.frequency} onValueChange={(value) => setItemForm({ ...itemForm, frequency: value as ScenarioItemForm["frequency"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="one_time">Único</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-2">
              <Label>Desde</Label>
              <Select value={itemForm.startMonth} onValueChange={(value) => setItemForm({ ...itemForm, startMonth: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((month) => <SelectItem key={month} value={String(month)}>{getMonthName(month)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-1">
              <Label>Año</Label>
              <Input type="number" value={itemForm.startYear} onChange={(event) => setItemForm({ ...itemForm, startYear: event.target.value })} />
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-2">
              <Label>Hasta</Label>
              <Select
                value={itemForm.frequency === "one_time" ? itemForm.startMonth : itemForm.endMonth}
                disabled={itemForm.frequency === "one_time"}
                onValueChange={(value) => setItemForm({ ...itemForm, endMonth: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((month) => <SelectItem key={month} value={String(month)}>{getMonthName(month)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2 xl:col-span-1">
              <Label>Año fin</Label>
              <Input
                type="number"
                value={itemForm.frequency === "one_time" ? itemForm.startYear : itemForm.endYear}
                disabled={itemForm.frequency === "one_time"}
                onChange={(event) => setItemForm({ ...itemForm, endYear: event.target.value })}
              />
            </div>
            <div className="flex min-w-0 gap-2 sm:col-span-2 xl:col-span-3">
              <Button type="button" className="min-w-0 flex-1 xl:flex-none" onClick={saveScenarioItem} disabled={isSubmitting || (!editingScenarioItem && !selectedScenario && !scenarioForm.name.trim())}>
                {editingScenarioItem ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingScenarioItem ? "Guardar" : "Ítem"}
              </Button>
              {editingScenarioItem && (
                <Button type="button" variant="outline" size="icon" onClick={resetItemForm} disabled={isSubmitting}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <Label>Categoría opcional</Label>
              <Select
                value={itemForm.categoryId}
                onValueChange={(value) => {
                  const category = categories?.find((item) => item.id === value)
                  setItemForm({
                    ...itemForm,
                    categoryId: value,
                    groupId: category?.group_id || itemForm.groupId,
                  })
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin categoría</SelectItem>
                  {(categories || []).filter((category) => category.type === "expense").map((category) => (
                    <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-0 space-y-2">
              <Label>Grupo opcional</Label>
              <Select value={itemForm.groupId} onValueChange={(value) => setItemForm({ ...itemForm, groupId: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin grupo</SelectItem>
                  {(groups || []).map((group) => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {(scenarios || []).map((scenario) => (
              <div key={scenario.id} className="rounded-md border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{scenario.name}</p>
                    {scenario.description && <p className="text-sm text-muted-foreground">{scenario.description}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{scenario.items?.length || 0} ítems</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button type="button" size="sm" variant={scenario.is_active ? "secondary" : "outline"} onClick={() => toggleScenario(scenario)}>
                      {scenario.is_active ? "Activo" : "Inactivo"}
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeletingScenario(scenario)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {(scenario.items || []).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {(scenario.items || []).map((item) => (
                      <div key={item.id} className="flex flex-col gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{scenarioItemLabel(item)}</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                          <span className="min-w-0 font-mono">{formatCurrency(Number(item.amount), currency)}</span>
                          <Button type="button" size="icon-sm" variant="ghost" onClick={() => editScenarioItem(scenario, item)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => deleteScenarioItem(scenario.id, item.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle mensual</CardTitle>
        </CardHeader>
        <CardContent>
          <TooltipProvider delayDuration={150}>
            <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Gastos</TableHead>
                    <TableHead className="text-right">Gasto simulado</TableHead>
                    <TableHead className="text-right">Ahorro</TableHead>
                    <TableHead className="text-right">Ahorro sim.</TableHead>
                    <TableHead className="text-right">Acum. sim.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyData.map((item) => (
                    <TableRow key={`${item.year}-${item.month}`}>
                      <TableCell className="font-medium">{getMonthName(item.month)} {item.year}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.income, currency)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {item.essentialProjection > 0 ? (
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
                                  <span className="font-mono">{formatCurrency(item.essentialProjection, currency)}</span>
                                </div>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        ) : formatCurrency(item.expenses, currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(item.simulatedExpenses, currency)}</TableCell>
                      <TableCell className={`text-right font-mono ${item.savings >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(item.savings, currency)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${item.simulatedSavings >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(item.simulatedSavings, currency)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${item.simulatedCumulativeSavings >= 0 ? "text-success" : "text-destructive"}`}>
                        {formatCurrency(item.simulatedCumulativeSavings, currency)}
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
          <CardTitle>Calendario financiero</CardTitle>
          <p className="text-sm text-muted-foreground">Línea de tiempo de compromisos, esenciales y escenarios activos.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Meses negativos</p>
              <p className="font-mono text-xl font-semibold">{negativeMonthsCount}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Mayor gasto</p>
              <p className="font-semibold">{getMonthName(biggestExpenseMonth?.month || selectedMonth)}</p>
              <p className="font-mono text-sm">{formatCurrency(biggestExpenseMonth?.simulatedExpenses || 0, currency)}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Menor liquidez</p>
              <p className="font-semibold">{getMonthName(lowestLiquidityMonth?.month || selectedMonth)}</p>
              <p className="font-mono text-sm">{formatCurrency(lowestLiquidityMonth?.simulatedSavings || 0, currency)}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-sm text-muted-foreground">Ahorro acumulado sim.</p>
              <p className="font-mono text-xl font-semibold">{formatCurrency(monthlyData[11]?.simulatedCumulativeSavings || 0, currency)}</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {calendarData.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground lg:col-span-3">
                No hay meses con movimientos proyectados para mostrar.
              </div>
            ) : calendarData.map((item) => (
              <div key={`${item.year}-${item.month}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{getMonthName(item.month)} {item.year}</p>
                  </div>
                  <p className={`font-mono text-sm ${item.simulatedSavings >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(item.simulatedSavings, currency)}
                  </p>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  <div className="flex justify-between gap-3"><span>Ingresos</span><span className="font-mono">{formatCurrency(item.income, currency)}</span></div>
                  <div className="flex justify-between gap-3"><span>Recurrentes</span><span className="font-mono">{formatCurrency(item.recurringExpenses, currency)}</span></div>
                  <div className="flex justify-between gap-3"><span>Cuotas</span><span className="font-mono">{formatCurrency(item.installments, currency)}</span></div>
                  <div className="flex justify-between gap-3"><span>Esenciales</span><span className="font-mono">{formatCurrency(item.essentialProjection, currency)}</span></div>
                  <div className="flex justify-between gap-3"><span>Escenarios</span><span className="font-mono">{formatCurrency(item.scenarioImpact, currency)}</span></div>
                  <div className="flex justify-between gap-3"><span>Meta ahorro</span><span className="font-mono">{formatCurrency(Number(settings?.monthly_savings_target || 0), currency)}</span></div>
                </div>
                {item.activeScenarioItems.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {item.activeScenarioItems.map((scenarioItem) => (
                      <span key={scenarioItem.id} className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">{scenarioItem.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cierre mensual</CardTitle>
          <p className="text-sm text-muted-foreground">Congela el resultado del mes como baseline histórico para comparaciones futuras.</p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">{getMonthName(selectedMonth)} {selectedYear}</p>
            {closedMonth ? (
              <p className="text-sm text-muted-foreground">Cerrado el {new Date(closedMonth.closed_at).toLocaleString("es-AR")}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sin cierre guardado todavía.</p>
            )}
          </div>
          <Button type="button" onClick={closeSelectedMonth} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {closedMonth ? "Actualizar cierre" : "Cerrar mes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Curva de gastos</CardTitle>
          <p className="text-sm text-muted-foreground">Comparación entre el gasto proyectado base y el gasto total con escenarios activos.</p>
        </CardHeader>
        <CardContent>
          <div className="h-[340px] min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 24, left: 12, bottom: 6 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value), currency)} tick={{ fontSize: 12 }} className="text-muted-foreground" width={54} />
                <ChartTooltip formatter={(value) => formatCurrency(Number(value), currency)} labelFormatter={(label) => `Mes: ${label}`} />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                <Line type="linear" dataKey="baseExpenses" name="Gasto base" stroke="#dc2626" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="linear" dataKey="simulatedExpenses" name="Gasto simulado" stroke="#2563eb" strokeWidth={4} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deletingScenario} onOpenChange={() => setDeletingScenario(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar escenario</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el escenario "{deletingScenario?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingScenario}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteScenario}
              disabled={isDeletingScenario}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingScenario && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
