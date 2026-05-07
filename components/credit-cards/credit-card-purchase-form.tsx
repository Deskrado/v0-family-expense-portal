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
import { CreditCardSelectLabel } from "@/components/credit-cards/card-brand"
import { formatDateOnlyForDisplay, getCreditCardInstallmentDueDate, getCreditCardStatementDueDate } from "@/lib/credit-card-billing"
import type { CreditCardPurchase } from "@/lib/types"
import { ArrowLeft, Loader2 } from "lucide-react"
import Link from "next/link"
import { mutate } from "swr"

type CreditCardPurchaseFormProps = {
  initialData?: CreditCardPurchase
}

type ExistingInstallmentTransaction = {
  id: string
  installment_number: number | null
  status: "pending" | "approved" | "rejected" | null
  approved_at: string | null
  approved_by: string | null
}

export function CreditCardPurchaseForm({ initialData }: CreditCardPurchaseFormProps) {
  const router = useRouter()
  const { data: cards } = useCreditCards()
  const { data: categories } = useCategories()
  const [form, setForm] = useState({
    credit_card_id: initialData?.credit_card_id || "",
    description: initialData?.description || "",
    total_amount: initialData?.total_amount?.toString() || "",
    total_installments: initialData?.total_installments?.toString() || "1",
    start_date: initialData?.start_date || new Date().toISOString().split("T")[0],
    category_id: initialData?.category_id || "__none",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedCard = cards?.find((card) => card.id === form.credit_card_id)
  const selectedCategory = categories?.find((category) => category.id === form.category_id)
  const firstInstallmentDueDate = selectedCard && form.start_date
    ? getCreditCardStatementDueDate(form.start_date, selectedCard)
    : form.start_date
  const installmentAmount = useMemo(() => {
    const total = Number(form.total_amount) || 0
    const installments = Math.max(Number(form.total_installments) || 1, 1)
    return total / installments
  }, [form.total_amount, form.total_installments])

  const savePurchase = async () => {
    if (!form.credit_card_id || !form.description.trim() || Number(form.total_amount) <= 0) {
      setError("Completa tarjeta, descripción y monto total")
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
    if (!selectedCard) {
      setError("Selecciona una tarjeta válida")
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estás autenticado")

      const totalInstallments = Number(form.total_installments)
      const purchasePayload = {
        user_id: user.id,
        credit_card_id: form.credit_card_id,
        description: form.description.trim(),
        total_amount: Number(form.total_amount),
        installment_amount: installmentAmount,
        total_installments: totalInstallments,
        current_installment: 1,
        start_date: form.start_date,
        category_id: form.category_id === "__none" ? null : form.category_id,
        currency_id: selectedCard.currency_id || null,
        is_active: true,
      }

      const purchaseResult = initialData?.id
        ? await supabase
            .from("credit_card_purchases")
            .update(purchasePayload)
            .eq("id", initialData.id)
            .select("id")
            .single()
        : await supabase
            .from("credit_card_purchases")
            .insert(purchasePayload)
            .select("id")
            .single()

      if (purchaseResult.error) throw purchaseResult.error
      const purchaseId = purchaseResult.data.id

      const { data: existingTransactions, error: existingTransactionsError } = await supabase
        .from("transactions")
        .select("id, installment_number, status, approved_at, approved_by")
        .eq("credit_card_purchase_id", purchaseId)

      if (existingTransactionsError) throw existingTransactionsError

      const existingByInstallment = new Map<number, ExistingInstallmentTransaction>()
      for (const transaction of (existingTransactions || []) as ExistingInstallmentTransaction[]) {
        if (transaction.installment_number) {
          existingByInstallment.set(Number(transaction.installment_number), transaction)
        }
      }

      for (let index = 0; index < totalInstallments; index += 1) {
        const installmentNumber = index + 1
        const dueDate = getCreditCardInstallmentDueDate(form.start_date, selectedCard, index)
        const existing = existingByInstallment.get(installmentNumber)
        const transactionPayload = {
          user_id: user.id,
          description: form.description.trim(),
          amount: installmentAmount,
          budgeted_amount: installmentAmount,
          currency_id: selectedCard.currency_id || null,
          category_id: form.category_id === "__none" ? null : form.category_id,
          group_id: selectedCategory?.group_id || null,
          transaction_date: dueDate,
          type: "expense",
          is_recurring: false,
          payment_method: "credit",
          credit_card_id: form.credit_card_id,
          credit_card_purchase_id: purchaseId,
          installment_number: installmentNumber,
          status: existing?.status || "approved",
          approved_at: existing?.approved_at || new Date().toISOString(),
          approved_by: existing?.approved_by || user.id,
          notes: null,
          metadata: {
            source: "credit_card_installment",
            purchase_date: form.start_date,
            billing_date: dueDate,
            billing_rule: "credit_card_statement_due",
            total_installments: totalInstallments,
          },
        }

        const transactionResult = existing
          ? await supabase.from("transactions").update(transactionPayload).eq("id", existing.id)
          : await supabase.from("transactions").insert(transactionPayload)

        if (transactionResult.error) throw transactionResult.error
      }

      const extraTransactionIds = ((existingTransactions || []) as ExistingInstallmentTransaction[])
        .filter((transaction) => Number(transaction.installment_number || 0) > totalInstallments)
        .map((transaction) => transaction.id)

      if (extraTransactionIds.length > 0) {
        const { error: deleteExtraError } = await supabase
          .from("transactions")
          .delete()
          .in("id", extraTransactionIds)
        if (deleteExtraError) throw deleteExtraError
      }

      mutate((key) => key === "credit-card-purchases" || (Array.isArray(key) && key[0] === "credit-card-purchases"))
      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
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
          <CardTitle>{initialData?.id ? "Editar compra en cuotas" : "Compra en cuotas"}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tarjeta</Label>
            <Select value={form.credit_card_id} onValueChange={(value) => setForm({ ...form, credit_card_id: value })}>
              <SelectTrigger>
                {selectedCard ? (
                  <CreditCardSelectLabel card={selectedCard} />
                ) : (
                  <SelectValue placeholder="Seleccionar tarjeta" />
                )}
              </SelectTrigger>
              <SelectContent>
                {cards?.filter((card) => card.is_active).map((card) => (
                  <SelectItem key={card.id} value={card.id} textValue={`${card.name} ${card.brand || ""} ${card.last_four || ""}`}>
                    <CreditCardSelectLabel card={card} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={form.category_id} onValueChange={(value) => setForm({ ...form, category_id: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría" />
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
          <Label htmlFor="description">Descripción</Label>
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
            <Label htmlFor="start_date">Fecha de compra</Label>
            <Input id="start_date" type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} />
          </div>
        </div>

        <div className="rounded-md border p-3">
          <p className="text-sm text-muted-foreground">Valor de cuota</p>
          <p className="text-xl font-semibold font-mono">{formatCurrency(installmentAmount, selectedCard?.currency)}</p>
          {selectedCard && form.start_date && (
            <p className="mt-2 text-sm text-muted-foreground">
              La primera cuota impactará el {formatDateOnlyForDisplay(firstInstallmentDueDate)} según el cierre y vencimiento de la tarjeta.
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={savePurchase} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initialData?.id ? "Guardar cambios" : "Guardar compra"}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/tarjetas">Cancelar</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
