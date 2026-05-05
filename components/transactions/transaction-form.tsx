"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useCategories, useGroups, useCurrencies, useCreditCards, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import { Switch } from "@/components/ui/switch"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { mutate } from "swr"

const transactionSchema = z.object({
  description: z.string().min(1, "La descripción es requerida"),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  budgeted_amount: z.coerce.number().optional(),
  currency_id: z.string().min(1, "Selecciona una moneda"),
  category_id: z.string().optional(),
  group_id: z.string().optional(),
  transaction_date: z.string().min(1, "La fecha es requerida"),
  payment_method: z.enum(["cash", "debit", "credit", "transfer"]).optional(),
  credit_card_id: z.string().optional(),
  is_recurring: z.boolean().default(false),
  notes: z.string().optional(),
})

type TransactionFormData = z.infer<typeof transactionSchema>

interface TransactionFormProps {
  type: "expense" | "income"
  initialData?: Partial<TransactionFormData> & { id?: string }
  backUrl?: string
  redirectUrl?: string
}

export function TransactionForm({ type, initialData, backUrl, redirectUrl }: TransactionFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { data: categories } = useCategories()
  const { data: groups } = useGroups()
  const { data: currencies } = useCurrencies()
  const { data: creditCards } = useCreditCards()
  const { data: settings } = useUserSettings()
  
  const filteredCategories = categories?.filter((c) => c.type === type) || []
  const defaultCurrency = settings?.default_currency || currencies?.find((c) => c.code === "ARS") || currencies?.[0]

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TransactionFormData>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      description: initialData?.description || "",
      amount: initialData?.amount || undefined,
      budgeted_amount: initialData?.budgeted_amount || undefined,
      currency_id: initialData?.currency_id || defaultCurrency?.id || "",
      category_id: initialData?.category_id || "__none",
      group_id: initialData?.group_id || "__none",
      transaction_date: initialData?.transaction_date || new Date().toISOString().split("T")[0],
      payment_method: initialData?.payment_method || undefined,
      credit_card_id: initialData?.credit_card_id || "__none",
      is_recurring: initialData?.is_recurring || false,
      notes: initialData?.notes || "",
    },
  })

  const isRecurring = watch("is_recurring")
  const selectedCurrencyId = watch("currency_id")
  const selectedCategoryId = watch("category_id")
  const selectedGroupId = watch("group_id")
  const paymentMethod = watch("payment_method")

  useEffect(() => {
    if (!selectedCurrencyId && defaultCurrency?.id) {
      setValue("currency_id", defaultCurrency.id)
    }
  }, [defaultCurrency?.id, selectedCurrencyId, setValue])

  useEffect(() => {
    if (!selectedCategoryId || selectedCategoryId === "__none") return
    if (selectedGroupId && selectedGroupId !== "__none") return

    const selectedCategory = filteredCategories.find((category) => category.id === selectedCategoryId)
    if (selectedCategory?.group_id) {
      setValue("group_id", selectedCategory.group_id)
    }
  }, [filteredCategories, selectedCategoryId, selectedGroupId, setValue])

  const handleCategoryChange = (value: string) => {
    setValue("category_id", value, { shouldDirty: true, shouldValidate: true })
    const selectedCategory = filteredCategories.find((category) => category.id === value)
    setValue("group_id", selectedCategory?.group_id || "__none", { shouldDirty: true, shouldValidate: true })
  }

  const onSubmit = async (data: TransactionFormData) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError("No estás autenticado")
        return
      }

      if (data.payment_method === "credit" && (!data.credit_card_id || data.credit_card_id === "__none")) {
        setError("Selecciona una tarjeta para pagos con credito")
        return
      }

      const transactionData = {
        ...data,
        type,
        user_id: user.id,
        category_id: data.category_id === "__none" ? null : data.category_id || null,
        group_id: data.group_id === "__none" ? null : data.group_id || null,
        payment_method: data.payment_method || null,
        credit_card_id: data.payment_method === "credit" && data.credit_card_id !== "__none" ? data.credit_card_id || null : null,
        budgeted_amount: data.budgeted_amount || data.amount,
      }

      if (initialData?.id) {
        const { error: updateError } = await supabase
          .from("transactions")
          .update(transactionData)
          .eq("id", initialData.id)
        
        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase
          .from("transactions")
          .insert(transactionData)
        
        if (insertError) throw insertError
      }

      // Revalidate data
      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
      
      router.push(redirectUrl || "/dashboard")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setIsSubmitting(false)
    }
  }

  const title = type === "expense" ? "Gasto" : "Ingreso"
  const resolvedBackUrl = backUrl || (type === "expense" ? "/dashboard/gastos" : "/dashboard/ingresos")

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={resolvedBackUrl}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <CardTitle>
            {initialData?.id ? `Editar ${title}` : `Nuevo ${title}`}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
              {error}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Input
                id="description"
                placeholder="Ej: Netflix, Supermercado..."
                {...register("description")}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction_date">Fecha</Label>
              <Input
                id="transaction_date"
                type="date"
                {...register("transaction_date")}
              />
              {errors.transaction_date && (
                <p className="text-sm text-destructive">{errors.transaction_date.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Monto Real</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="budgeted_amount">Monto Previsto</Label>
              <Input
                id="budgeted_amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("budgeted_amount")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency_id">Moneda</Label>
              <Select
                value={watch("currency_id")}
                onValueChange={(value) => setValue("currency_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {currencies?.map((currency) => (
                    <SelectItem key={currency.id} value={currency.id}>
                      {currency.code} ({currency.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.currency_id && (
                <p className="text-sm text-destructive">{errors.currency_id.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category_id">Categoría</Label>
              <Select
                value={selectedCategoryId}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin categoria</SelectItem>
                  {filteredCategories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="group_id">Grupo</Label>
              <Select
                value={selectedGroupId}
                onValueChange={(value) => setValue("group_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sin grupo</SelectItem>
                  {groups?.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {type === "expense" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payment_method">Método de pago</Label>
                <Select
                  value={watch("payment_method")}
                  onValueChange={(value) => setValue("payment_method", value as "cash" | "debit" | "credit" | "transfer")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar metodo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Efectivo</SelectItem>
                    <SelectItem value="debit">Débito</SelectItem>
                    <SelectItem value="credit">Crédito</SelectItem>
                    <SelectItem value="transfer">Transferencia</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentMethod === "credit" && (
                <div className="space-y-2">
                  <Label htmlFor="credit_card_id">Tarjeta</Label>
                  <Select
                    value={watch("credit_card_id")}
                    onValueChange={(value) => setValue("credit_card_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tarjeta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sin tarjeta</SelectItem>
                      {creditCards?.filter((card) => card.is_active).map((card) => (
                        <SelectItem key={card.id} value={card.id}>
                          {card.name}{card.last_four ? ` **** ${card.last_four}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Switch
              id="is_recurring"
              checked={isRecurring}
              onCheckedChange={(checked) => setValue("is_recurring", checked)}
            />
            <Label htmlFor="is_recurring">
              {type === "expense" ? "Gasto recurrente" : "Ingreso recurrente"}
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              placeholder="Notas adicionales..."
              {...register("notes")}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {initialData?.id ? "Guardar Cambios" : "Crear"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
