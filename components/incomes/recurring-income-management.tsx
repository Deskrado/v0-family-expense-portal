"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import {
  useCategories,
  useCurrencies,
  useGroups,
  useRecurringIncomeTemplates,
  useUserSettings,
} from "@/components/dashboard/use-dashboard-data"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import { formatCurrency } from "@/lib/currency"
import type { RecurringIncomeTemplate } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
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
import { Loader2, Pencil, Play, Plus, Save, Trash2 } from "lucide-react"
import { mutate } from "swr"

type TemplateForm = {
  description: string
  amount: string
  currency_id: string
  category_id: string
  group_id: string
  day_of_month: string
  start_date: string
  end_date: string
  is_active: boolean
  notes: string
}

const emptyForm: TemplateForm = {
  description: "",
  amount: "",
  currency_id: "",
  category_id: "__none",
  group_id: "__none",
  day_of_month: "1",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  is_active: true,
  notes: "",
}

function templateToForm(template: RecurringIncomeTemplate): TemplateForm {
  return {
    description: template.description,
    amount: template.amount.toString(),
    currency_id: template.currency_id || "",
    category_id: template.category_id || "__none",
    group_id: template.group_id || "__none",
    day_of_month: template.day_of_month.toString(),
    start_date: template.start_date,
    end_date: template.end_date || "",
    is_active: template.is_active,
    notes: template.notes || "",
  }
}

async function postJson(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la solicitud")
  return payload
}

export function RecurringIncomeManagement() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { data: templates, isLoading } = useRecurringIncomeTemplates()
  const { data: currencies } = useCurrencies()
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: settings } = useUserSettings()
  const [form, setForm] = useState<TemplateForm>(emptyForm)
  const [editing, setEditing] = useState<RecurringIncomeTemplate | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const incomeCategories = categories?.filter((category) => category.type === "income") || []
  const defaultCurrencyId = settings?.default_currency_id || currencies?.find((currency) => currency.code === "ARS")?.id || currencies?.[0]?.id || ""

  const handleCategoryChange = (value: string) => {
    const selectedCategory = incomeCategories.find((category) => category.id === value)
    setForm((current) => ({
      ...current,
      category_id: value,
      group_id: selectedCategory?.group_id || "__none",
    }))
  }

  const totals = useMemo(() => {
    return (templates || []).reduce((total, template) => total + (template.is_active ? Number(template.amount) : 0), 0)
  }, [templates])
  const indefiniteTemplates = useMemo(() => {
    return (templates || []).filter((template) => template.is_active && !template.end_date).length
  }, [templates])

  const resetForm = () => {
    setEditing(null)
    setForm({ ...emptyForm, currency_id: defaultCurrencyId })
  }

  const saveTemplate = async () => {
    setIsSubmitting(true)
    setMessage(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const amount = Number(form.amount)
      const dayOfMonth = Number(form.day_of_month)
      if (!form.description.trim()) throw new Error("Completa la descripción")
      if (amount <= 0) throw new Error("El monto debe ser mayor a cero")
      const currencyId = form.currency_id || defaultCurrencyId
      if (!currencyId) throw new Error("Selecciona una moneda")
      if (dayOfMonth < 1 || dayOfMonth > 28) throw new Error("El dia de cobro debe estar entre 1 y 28")
      if (form.end_date && form.end_date < form.start_date) throw new Error("La fecha de fin no puede ser anterior al inicio")

      const payload = {
        user_id: user.id,
        description: form.description.trim(),
        amount,
        currency_id: currencyId,
        category_id: form.category_id === "__none" ? null : form.category_id,
        group_id: form.group_id === "__none" ? null : form.group_id,
        day_of_month: dayOfMonth,
        start_date: form.start_date,
        end_date: form.end_date || null,
        frequency: "monthly",
        auto_generate_months_ahead: 1,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      }

      const result = editing
        ? await supabase.from("recurring_income_templates").update(payload).eq("id", editing.id)
        : await supabase.from("recurring_income_templates").insert(payload)

      if (result.error) throw result.error
      mutate((key) => key === "recurring-income-templates" || (Array.isArray(key) && key[0] === "recurring-income-templates"))
      setMessage("Ingreso recurrente guardado")
      resetForm()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al guardar ingreso recurrente")
    } finally {
      setIsSubmitting(false)
    }
  }

  const generatePending = async (templateId?: string) => {
    setAction(templateId ? `generate-${templateId}` : "generate-all")
    setMessage(null)

    try {
      const result = await postJson("/api/recurring-incomes/generate", {
        templateId,
        month: selectedMonth,
        year: selectedYear,
      })
      mutate((key) => {
        const keyName = Array.isArray(key) ? key[0] : key
        return typeof keyName === "string" && keyName.startsWith("transactions")
      })
      mutate((key) => key === "recurring-income-templates" || (Array.isArray(key) && key[0] === "recurring-income-templates"))
      setMessage(`Pendientes generados: ${result.created || 0}. Omitidos: ${result.skipped || 0}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error al generar pendientes")
    } finally {
      setAction(null)
    }
  }

  const toggleTemplate = async (template: RecurringIncomeTemplate) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("recurring_income_templates")
      .update({ is_active: !template.is_active })
      .eq("id", template.id)
    if (error) {
      setMessage(error.message)
      return
    }
    mutate((key) => key === "recurring-income-templates" || (Array.isArray(key) && key[0] === "recurring-income-templates"))
  }

  const removeTemplate = async (template: RecurringIncomeTemplate) => {
    if (!window.confirm(`Eliminar "${template.description}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from("recurring_income_templates").delete().eq("id", template.id)
    if (error) {
      setMessage(error.message)
      return
    }
    mutate((key) => key === "recurring-income-templates" || (Array.isArray(key) && key[0] === "recurring-income-templates"))
  }

  return (
    <div className="space-y-4">
      {message && <div className="rounded-md border bg-muted p-3 text-sm">{message}</div>}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Ingresos activos</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{templates?.filter((template) => template.is_active).length || 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Previsto mensual</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold font-mono">
            {formatCurrency(totals, settings?.default_currency || currencies?.[0])}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Sin finalización</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{indefiniteTemplates}</p>
            <p className="text-xs text-muted-foreground">Se proyectan hasta pausarlos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar recurrente" : "Nuevo recurrente"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Sueldo, monotributo..." />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Monto</Label>
                <Input type="number" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency_id || defaultCurrencyId} onValueChange={(value) => setForm({ ...form, currency_id: value })}>
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
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin categoria</SelectItem>
                    {incomeCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select value={form.group_id} onValueChange={(value) => setForm({ ...form, group_id: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sin grupo</SelectItem>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Día de cobro</Label>
                <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(event) => setForm({ ...form, day_of_month: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Inicio</Label>
                <Input type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fin opcional</Label>
                <Input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} />
              </div>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              Si no cargás una fecha de fin, el ingreso queda vigente todos los meses y se incluye en la proyección hasta que lo pauses o lo elimines.
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </div>
            <label className="flex items-center gap-3 rounded-md border p-3">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <span className="text-sm font-medium">Activo</span>
            </label>
            <div className="flex gap-2">
              <Button onClick={saveTemplate} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Guardar
              </Button>
              <Button variant="outline" onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Plantillas</CardTitle>
              <Button onClick={() => generatePending()} disabled={action === "generate-all"}>
                {action === "generate-all" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Generar pendientes
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !templates?.length ? (
              <div className="py-8 text-center text-muted-foreground">No hay ingresos recurrentes configurados</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Día</TableHead>
                      <TableHead>Vigencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {templates.map((template) => (
                      <TableRow key={template.id}>
                        <TableCell>
                          <div className="font-medium">{template.description}</div>
                          <div className="text-xs text-muted-foreground">{template.category?.name || "Sin categoria"}</div>
                        </TableCell>
                        <TableCell>{template.day_of_month}</TableCell>
                        <TableCell>
                          {template.end_date ? (
                            <span>Hasta {new Date(`${template.end_date}T00:00:00`).toLocaleDateString("es-AR")}</span>
                          ) : (
                            <Badge variant="outline">Indefinido</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(Number(template.amount), template.currency)}</TableCell>
                        <TableCell>
                          <Badge variant={template.is_active ? "secondary" : "outline"}>{template.is_active ? "Activo" : "Pausado"}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => generatePending(template.id)} disabled={action === `generate-${template.id}`}>
                              {action === `generate-${template.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(template); setForm(templateToForm(template)) }}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => toggleTemplate(template)}>
                              {template.is_active ? "Pausar" : "Activar"}
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => removeTemplate(template)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
