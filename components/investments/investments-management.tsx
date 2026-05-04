"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useCurrencies, useInvestments, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import { formatCurrency } from "@/lib/currency"
import type { Investment } from "@/lib/types"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2 } from "lucide-react"
import { mutate } from "swr"

type InvestmentForm = {
  name: string
  type: Investment["type"]
  initial_amount: string
  current_value: string
  currency_id: string
  start_date: string
  end_date: string
  interest_rate: string
  notes: string
  is_active: boolean
}

const emptyForm: InvestmentForm = {
  name: "",
  type: "plazo_fijo",
  initial_amount: "",
  current_value: "",
  currency_id: "",
  start_date: new Date().toISOString().split("T")[0],
  end_date: "",
  interest_rate: "",
  notes: "",
  is_active: true,
}

function investmentToForm(investment: Investment): InvestmentForm {
  return {
    name: investment.name,
    type: investment.type,
    initial_amount: investment.initial_amount.toString(),
    current_value: investment.current_value.toString(),
    currency_id: investment.currency_id || "",
    start_date: investment.start_date,
    end_date: investment.end_date || "",
    interest_rate: investment.interest_rate?.toString() || "",
    notes: investment.notes || "",
    is_active: investment.is_active,
  }
}

export function InvestmentsManagement() {
  const { data: investments, isLoading } = useInvestments()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Investment | null>(null)
  const [form, setForm] = useState<InvestmentForm>(emptyForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defaultCurrencyId = settings?.default_currency_id || currencies?.find((currency) => currency.code === "ARS")?.id || currencies?.[0]?.id || ""
  const visibleInvestments = useMemo(() => {
    const query = search.toLowerCase()
    return (investments || []).filter((investment) =>
      `${investment.name} ${investment.type} ${investment.notes || ""}`.toLowerCase().includes(query)
    )
  }, [investments, search])

  const totals = (investments || []).reduce(
    (acc, investment) => {
      if (investment.is_active) {
        acc.initial += Number(investment.initial_amount)
        acc.current += Number(investment.current_value)
      }
      return acc
    },
    { initial: 0, current: 0 }
  )

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyForm, currency_id: defaultCurrencyId })
    setError(null)
    setDialogOpen(true)
  }

  const openEdit = (investment: Investment) => {
    setEditing(investment)
    setForm(investmentToForm(investment))
    setError(null)
    setDialogOpen(true)
  }

  const saveInvestment = async () => {
    if (!form.name.trim() || Number(form.initial_amount) < 0 || Number(form.current_value) < 0) {
      setError("Completa nombre, monto inicial y valor actual")
      return
    }
    if (!form.start_date) {
      setError("Selecciona la fecha de inicio")
      return
    }
    if (form.end_date && form.end_date < form.start_date) {
      setError("La fecha de fin no puede ser anterior al inicio")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        type: form.type,
        initial_amount: Number(form.initial_amount),
        current_value: Number(form.current_value),
        currency_id: form.currency_id || null,
        start_date: form.start_date,
        end_date: form.end_date || null,
        interest_rate: form.interest_rate ? Number(form.interest_rate) : null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      }

      const result = editing
        ? await supabase.from("investments").update(payload).eq("id", editing.id)
        : await supabase.from("investments").insert(payload)

      if (result.error) throw result.error
      mutate("investments")
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la inversion")
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteInvestment = async (investment: Investment) => {
    if (!window.confirm(`Cerrar la inversion "${investment.name}"?`)) return
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from("investments")
      .update({ is_active: false, end_date: investment.end_date || new Date().toISOString().split("T")[0] })
      .eq("id", investment.id)
    if (updateError) {
      setError(updateError.message)
      return
    }
    mutate("investments")
  }

  const defaultCurrency = settings?.default_currency || currencies?.find((currency) => currency.code === "ARS") || currencies?.[0] || null

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Capital inicial activo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {formatCurrency(totals.initial, defaultCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor actual activo</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {formatCurrency(totals.current, defaultCurrency)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Resultado</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-bold font-mono ${totals.current - totals.initial >= 0 ? "text-success" : "text-destructive"}`}>
            {formatCurrency(totals.current - totals.initial, defaultCurrency)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Inversiones</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-8" />
              </div>
              <Button onClick={openNew}>
                <Plus className="mr-2 h-4 w-4" />
                Nueva
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && !dialogOpen && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : visibleInvestments.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No hay inversiones registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Inicio</TableHead>
                    <TableHead className="text-right">Inicial</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Resultado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleInvestments.map((investment) => {
                    const result = Number(investment.current_value) - Number(investment.initial_amount)
                    return (
                      <TableRow key={investment.id}>
                        <TableCell className="font-medium">{investment.name}</TableCell>
                        <TableCell>{investment.type.replace("_", " ")}</TableCell>
                        <TableCell>{new Date(investment.start_date).toLocaleDateString("es-AR")}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(investment.initial_amount), investment.currency)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(investment.current_value), investment.currency)}</TableCell>
                        <TableCell className={`text-right font-mono ${result >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(result, investment.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={investment.is_active ? "secondary" : "outline"}>{investment.is_active ? "Activa" : "Cerrada"}</Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEdit(investment)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => deleteInvestment(investment)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Cerrar
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
            <DialogTitle>{editing ? "Editar inversion" : "Nueva inversion"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value as Investment["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plazo_fijo">Plazo fijo</SelectItem>
                    <SelectItem value="acciones">Acciones</SelectItem>
                    <SelectItem value="crypto">Crypto</SelectItem>
                    <SelectItem value="fci">FCI</SelectItem>
                    <SelectItem value="bonos">Bonos</SelectItem>
                    <SelectItem value="otros">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Inicial</Label>
                <Input type="number" step="0.01" value={form.initial_amount} onChange={(event) => setForm({ ...form, initial_amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Actual</Label>
                <Input type="number" step="0.01" value={form.current_value} onChange={(event) => setForm({ ...form, current_value: event.target.value })} />
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
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fin</Label>
                <Input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Tasa %</Label>
                <Input type="number" step="0.01" value={form.interest_rate} onChange={(event) => setForm({ ...form, interest_rate: event.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Activa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveInvestment} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
