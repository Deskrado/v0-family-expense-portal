"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useCategories, useCreditCards } from "@/components/dashboard/use-dashboard-data"
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
import { formatCurrency } from "@/lib/currency"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { mutate } from "swr"

export function CreditCardPurchaseForm() {
  const router = useRouter()
  const { data: cards } = useCreditCards()
  const { data: categories } = useCategories()
  const [form, setForm] = useState({
    credit_card_id: "",
    description: "",
    total_amount: "",
    total_installments: "1",
    start_date: new Date().toISOString().split("T")[0],
    category_id: "__none",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCard = cards?.find((card) => card.id === form.credit_card_id)
  const installmentAmount = useMemo(() => {
    const total = Number(form.total_amount) || 0
    const installments = Math.max(Number(form.total_installments) || 1, 1)
    return total / installments
  }, [form.total_amount, form.total_installments])

  const savePurchase = async () => {
    if (!form.credit_card_id || !form.description.trim() || Number(form.total_amount) <= 0) {
      setError("Completa tarjeta, descripcion y monto total")
      return
    }
    if (!form.start_date) {
      setError("Selecciona la fecha de inicio")
      return
    }
    if (!Number.isInteger(Number(form.total_installments)) || Number(form.total_installments) < 1) {
      setError("La cantidad de cuotas debe ser mayor o igual a 1")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const { error: insertError } = await supabase
        .from("credit_card_purchases")
        .insert({
          user_id: user.id,
          credit_card_id: form.credit_card_id,
          description: form.description.trim(),
          total_amount: Number(form.total_amount),
          installment_amount: installmentAmount,
          total_installments: Number(form.total_installments),
          current_installment: 1,
          start_date: form.start_date,
          category_id: form.category_id === "__none" ? null : form.category_id,
          is_active: true,
        })

      if (insertError) throw insertError

      mutate("credit-card-purchases")
      router.push("/dashboard/tarjetas")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la compra")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/tarjetas">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <CardTitle>Compra en cuotas</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tarjeta</Label>
            <Select value={form.credit_card_id} onValueChange={(value) => setForm({ ...form, credit_card_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tarjeta" />
              </SelectTrigger>
              <SelectContent>
                {cards?.filter((card) => card.is_active).map((card) => (
                  <SelectItem key={card.id} value={card.id}>
                    {card.name}{card.last_four ? ` **** ${card.last_four}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sin categoria</SelectItem>
                {categories?.filter((category) => category.type === "expense").map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descripcion</Label>
          <Input id="description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="total_amount">Monto total</Label>
            <Input id="total_amount" type="number" step="0.01" value={form.total_amount} onChange={(event) => setForm({ ...form, total_amount: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="total_installments">Cuotas</Label>
            <Input id="total_installments" type="number" min={1} value={form.total_installments} onChange={(event) => setForm({ ...form, total_installments: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="start_date">Inicio</Label>
            <Input id="start_date" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          </div>
        </div>

        <div className="rounded-md border p-3">
          <p className="text-sm text-muted-foreground">Valor de cuota</p>
          <p className="text-xl font-semibold font-mono">{formatCurrency(installmentAmount, selectedCard?.currency)}</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={savePurchase} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar compra
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/tarjetas">Cancelar</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
