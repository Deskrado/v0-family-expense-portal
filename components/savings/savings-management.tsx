"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  useBrokerPositions,
  useCurrencies,
  useFxQuotes,
  useInvestments,
  useMonthlySummary,
  usePortfolioSnapshots,
  useSavingsGoals,
  useUserSettings,
} from "@/components/dashboard/use-dashboard-data"
import { formatCurrency } from "@/lib/currency"
import { getWealthBreakdown } from "@/lib/wealth-summary"
import type { SavingsGoal } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
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
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { invalidateCache } from "@/lib/swr-cache"
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

type GoalForm = {
  name: string
  target_amount: string
  current_amount: string
  currency_id: string
  target_date: string
  monthly_target: string
  is_completed: boolean
}

const emptyForm: GoalForm = {
  name: "",
  target_amount: "",
  current_amount: "0",
  currency_id: "",
  target_date: "",
  monthly_target: "",
  is_completed: false,
}

function goalToForm(goal: SavingsGoal): GoalForm {
  return {
    name: goal.name,
    target_amount: goal.target_amount.toString(),
    current_amount: goal.current_amount.toString(),
    currency_id: goal.currency_id || "",
    target_date: goal.target_date || "",
    monthly_target: goal.monthly_target?.toString() || "",
    is_completed: goal.is_completed,
  }
}

export function SavingsManagement() {
  const { data: goals, isLoading } = useSavingsGoals()
  const { summary } = useMonthlySummary()
  const { data: investments } = useInvestments()
  const { data: brokerPositions } = useBrokerPositions()
  const { data: portfolioSnapshots } = usePortfolioSnapshots()
  const { data: fxQuotes } = useFxQuotes()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<SavingsGoal | null>(null)
  const [form, setForm] = useState<GoalForm>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<SavingsGoal | null>(null)
  const [isDeletingGoal, setIsDeletingGoal] = useState(false)

  const defaultCurrency = settings?.default_currency || currencies?.find((currency) => currency.code === "ARS") || currencies?.[0] || null
  const defaultCurrencyId = settings?.default_currency_id || defaultCurrency?.id || ""
  const cashBalance = (settings?.initial_balance || 0) + summary.savings
  const wealthBreakdown = getWealthBreakdown({
    cashBalance,
    investments,
    brokerPositions,
    portfolioSnapshots,
    savingsGoals: goals,
    fxQuotes,
    defaultCurrency,
  })
  const visibleGoals = useMemo(() => {
    const query = search.toLowerCase()
    return (goals || []).filter((goal) => goal.name.toLowerCase().includes(query))
  }, [goals, search])

  const totals = (goals || []).reduce(
    (acc, goal) => {
      if (!goal.is_completed) {
        acc.current += Number(goal.current_amount)
        acc.target += Number(goal.target_amount)
      }
      return acc
    },
    { current: 0, target: 0 }
  )

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyForm, currency_id: defaultCurrencyId })
    setError(null)
    setDialogOpen(true)
  }

  const openEdit = (goal: SavingsGoal) => {
    setEditing(goal)
    setForm(goalToForm(goal))
    setError(null)
    setDialogOpen(true)
  }

  const saveGoal = async () => {
    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estás autenticado")

      if (!form.name.trim() || Number(form.target_amount) <= 0 || Number(form.current_amount) < 0) {
        throw new Error("Completa nombre, meta y monto actual")
      }
      if (form.monthly_target && Number(form.monthly_target) < 0) {
        throw new Error("La meta mensual no puede ser negativa")
      }

      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        target_amount: Number(form.target_amount),
        current_amount: Number(form.current_amount),
        currency_id: form.currency_id || null,
        target_date: form.target_date || null,
        monthly_target: form.monthly_target ? Number(form.monthly_target) : null,
        is_completed: form.is_completed,
      }

      const result = editing
        ? await supabase.from("savings_goals").update(payload).eq("id", editing.id)
        : await supabase.from("savings_goals").insert(payload)

      if (result.error) throw result.error
      invalidateCache("savings-goals")
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la meta")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteGoal = async () => {
    if (!deletingGoal) return
    setIsDeletingGoal(true)
    try {
      const supabase = createClient()
      const { error: deleteError } = await supabase.from("savings_goals").delete().eq("id", deletingGoal.id)
      if (deleteError) {
        setError(deleteError.message)
        return
      }
      invalidateCache("savings-goals")
    } finally {
      setIsDeletingGoal(false)
      setDeletingGoal(null)
    }
  }

  const globalProgress = totals.target > 0 ? Math.min((totals.current / totals.target) * 100, 100) : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Resumen patrimonial</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Total general</p>
              <p className="font-mono text-2xl font-bold sm:text-3xl">{formatCurrency(wealthBreakdown.total, defaultCurrency)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Ahorro del mes</p>
              <p className="text-xl font-semibold font-mono">{formatCurrency(summary.savings, defaultCurrency)}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs text-muted-foreground">Cash</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(wealthBreakdown.cash, defaultCurrency)}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs text-muted-foreground">Inversiones</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(wealthBreakdown.investments, defaultCurrency)}</p>
            </div>
            <div className="rounded-md bg-muted p-3">
              <p className="text-xs text-muted-foreground">Divisas extranjeras</p>
              <p className="text-lg font-semibold font-mono">{formatCurrency(wealthBreakdown.foreignCurrencies, defaultCurrency)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t pt-4">
            <div>
              <p className="text-sm text-muted-foreground">Acumulado en metas activas</p>
              <p className="text-xl font-semibold font-mono">{formatCurrency(totals.current, defaultCurrency)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-sm text-muted-foreground">Objetivo total</p>
              <p className="text-xl font-semibold font-mono">{formatCurrency(totals.target, defaultCurrency)}</p>
            </div>
          </div>
          <Progress value={globalProgress} className="h-2" />
          <p className="text-xs text-muted-foreground">{globalProgress.toFixed(0)}% completado</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Metas de ahorro</CardTitle>
            <div className="grid gap-2 sm:flex">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
              </div>
              <Button className="w-full sm:w-auto" onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : visibleGoals.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No hay metas registradas</div>
          ) : (
            <div className="overflow-x-auto">
              {error && !dialogOpen && (
                <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meta</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Objetivo</TableHead>
                    <TableHead>Progreso</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleGoals.map((goal) => {
                    const progress = goal.target_amount > 0 ? Math.min((Number(goal.current_amount) / Number(goal.target_amount)) * 100, 100) : 0
                    return (
                      <TableRow key={goal.id}>
                        <TableCell className="font-medium">{goal.name}</TableCell>
                        <TableCell>{goal.target_date ? new Date(goal.target_date).toLocaleDateString("es-AR") : "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(goal.current_amount), goal.currency)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(goal.target_amount), goal.currency)}</TableCell>
                        <TableCell className="min-w-40">
                          <Progress value={progress} className="h-2" />
                          <span className="text-xs text-muted-foreground">{progress.toFixed(0)}%</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={goal.is_completed ? "secondary" : "outline"}>{goal.is_completed ? "Completada" : "Activa"}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" aria-label="Más acciones de meta de ahorro">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(goal)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeletingGoal(goal)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar meta" : "Nueva meta"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Input type="number" step="0.01" value={form.target_amount} onChange={(event) => setForm({ ...form, target_amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Actual</Label>
                <Input type="number" step="0.01" value={form.current_amount} onChange={(event) => setForm({ ...form, current_amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency_id} onValueChange={(value) => setForm({ ...form, currency_id: value })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>
                    {currencies?.map((currency) => (
                      <SelectItem key={currency.id} value={currency.id}>{currency.code} ({currency.symbol})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha objetivo</Label>
                <Input type="date" value={form.target_date} onChange={(event) => setForm({ ...form, target_date: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Meta mensual</Label>
                <Input type="number" step="0.01" value={form.monthly_target} onChange={(event) => setForm({ ...form, monthly_target: event.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveGoal} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingGoal} onOpenChange={() => setDeletingGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar meta</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la meta "{deletingGoal?.name}"? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingGoal}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteGoal}
              disabled={isDeletingGoal}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingGoal && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
