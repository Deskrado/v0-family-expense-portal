"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import { useCreditCardPurchases, useCreditCards, useCreditCardStatementTransactions, useCurrencies, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import { formatCurrency } from "@/lib/currency"
import { dateOnlyToLocalDate, getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"
import { getCreditCardInstallmentDueDate, getCreditCardStatementDueDate } from "@/lib/credit-card-billing"
import type { CreditCard, Transaction } from "@/lib/types"
import { CARD_BRANDS, CardBrandMark, CreditCardSelectLabel, getCardBrandLabel, normalizeCardBrand } from "@/components/credit-cards/card-brand"
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
import { CreditCard as CreditCardIcon, Loader2, MoreHorizontal, Pencil, Plus, Repeat, Search, XCircle } from "lucide-react"
import Link from "next/link"
import { mutate } from "swr"

type CardFormState = {
  name: string
  brand: string
  last_four: string
  credit_limit: string
  closing_day: string
  due_day: string
  currency_id: string
  is_active: boolean
}

const emptyCardForm: CardFormState = {
  name: "",
  brand: "__none",
  last_four: "",
  credit_limit: "",
  closing_day: "",
  due_day: "",
  currency_id: "",
  is_active: true,
}

function cardToForm(card: CreditCard): CardFormState {
  return {
    name: card.name,
    brand: normalizeCardBrand(card.brand),
    last_four: card.last_four || "",
    credit_limit: card.credit_limit?.toString() || "",
    closing_day: card.closing_day?.toString() || "",
    due_day: card.due_day?.toString() || "",
    currency_id: card.currency_id || "",
    is_active: card.is_active,
  }
}

function transactionStatementKey(transaction: Transaction) {
  const metadata = transaction.metadata || {}
  const seriesId = typeof metadata.recurring_series_id === "string" ? metadata.recurring_series_id : null
  if (seriesId) return `series:${seriesId}`

  return [
    transaction.description.trim().toLowerCase(),
    transaction.category_id || "no-category",
    transaction.group_id || "no-group",
    transaction.credit_card_id || "no-card",
    transaction.currency_id || "no-currency",
  ].join("|")
}

function isTransactionInMonth(transaction: Transaction, year: number, month: number) {
  return getYearFromDateOnly(transaction.transaction_date) === year && getMonthIndexFromDateOnly(transaction.transaction_date) === month - 1
}

function isTransactionBeforeOrInMonth(transaction: Transaction, year: number, month: number) {
  const transactionYear = getYearFromDateOnly(transaction.transaction_date)
  const transactionMonth = getMonthIndexFromDateOnly(transaction.transaction_date) + 1
  return transactionYear < year || (transactionYear === year && transactionMonth <= month)
}

export function CreditCardManagement() {
  const { selectedMonth, selectedYear } = useDashboard()
  const nextStatementMonth = selectedMonth === 12 ? 1 : selectedMonth + 1
  const nextStatementYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear
  const { data: cards, isLoading } = useCreditCards()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()
  const { data: purchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: statementTransactions } = useCreditCardStatementTransactions(nextStatementYear, nextStatementMonth)
  const [search, setSearch] = useState("")
  const [form, setForm] = useState<CardFormState>(emptyCardForm)
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consumptionCardFilter, setConsumptionCardFilter] = useState("all")

  const visibleCards = useMemo(() => {
    const query = search.toLowerCase()
    return (cards || []).filter((card) =>
      `${card.name} ${getCardBrandLabel(card.brand)} ${card.last_four || ""}`.toLowerCase().includes(query)
    )
  }, [cards, search])
  const filteredPurchases = useMemo(() => {
    if (consumptionCardFilter === "all") return purchases || []
    return (purchases || []).filter((purchase) => purchase.credit_card_id === consumptionCardFilter)
  }, [consumptionCardFilter, purchases])

  const defaultCurrencyId = settings?.default_currency_id || currencies?.find((currency) => currency.code === "ARS")?.id || currencies?.[0]?.id || ""
  const nextStatementTotals = useMemo(() => {
    const totalsByCard = new Map<string, number>()
    const targetTransactions = (statementTransactions || []).filter((transaction) =>
      transaction.status !== "rejected" &&
      transaction.credit_card_id &&
      isTransactionInMonth(transaction, nextStatementYear, nextStatementMonth)
    )

    for (const transaction of targetTransactions) {
      totalsByCard.set(
        transaction.credit_card_id!,
        (totalsByCard.get(transaction.credit_card_id!) || 0) + Number(transaction.budgeted_amount || transaction.amount || 0),
      )
    }

    const actualRecurringKeys = new Set(
      targetTransactions
        .filter((transaction) => transaction.is_recurring)
        .map(transactionStatementKey),
    )
    const latestRecurringByKey = new Map<string, Transaction>()

    for (const transaction of statementTransactions || []) {
      if (!transaction.credit_card_id || !transaction.is_recurring || transaction.status === "rejected") continue
      if (!isTransactionBeforeOrInMonth(transaction, nextStatementYear, nextStatementMonth)) continue

      const endDate = typeof transaction.metadata?.recurrence_end_date === "string" ? transaction.metadata.recurrence_end_date : null
      const targetDate = `${nextStatementYear}-${String(nextStatementMonth).padStart(2, "0")}-01`
      if (endDate && targetDate > endDate) continue

      const key = transactionStatementKey(transaction)
      const current = latestRecurringByKey.get(key)
      if (!current || transaction.transaction_date > current.transaction_date) {
        latestRecurringByKey.set(key, transaction)
      }
    }

    for (const [key, transaction] of latestRecurringByKey.entries()) {
      if (actualRecurringKeys.has(key)) continue
      totalsByCard.set(
        transaction.credit_card_id!,
        (totalsByCard.get(transaction.credit_card_id!) || 0) + Number(transaction.budgeted_amount || transaction.amount || 0),
      )
    }

    for (const purchase of purchases || []) {
      for (let installmentIndex = 0; installmentIndex < purchase.total_installments; installmentIndex += 1) {
        const dueDate = getCreditCardInstallmentDueDate(purchase.start_date, purchase.credit_card, installmentIndex)
        if (getYearFromDateOnly(dueDate) !== nextStatementYear || getMonthIndexFromDateOnly(dueDate) !== nextStatementMonth - 1) continue

        const hasTransaction = (purchase.transactions || []).some(
          (transaction) => Number(transaction.installment_number || 0) === installmentIndex + 1,
        )
        if (hasTransaction) continue

        totalsByCard.set(
          purchase.credit_card_id,
          (totalsByCard.get(purchase.credit_card_id) || 0) + Number(purchase.installment_amount || 0),
        )
      }
    }

    return totalsByCard
  }, [nextStatementMonth, nextStatementYear, purchases, statementTransactions])
  const recurringCardDebits = useMemo(() => {
    const targetDate = `${nextStatementYear}-${String(nextStatementMonth).padStart(2, "0")}-01`
    const latestByKey = new Map<string, Transaction>()

    for (const transaction of statementTransactions || []) {
      if (!transaction.credit_card_id || !transaction.is_recurring || transaction.status === "rejected") continue
      if (!isTransactionBeforeOrInMonth(transaction, nextStatementYear, nextStatementMonth)) continue

      const endDate = typeof transaction.metadata?.recurrence_end_date === "string" ? transaction.metadata.recurrence_end_date : null
      if (endDate && targetDate > endDate) continue

      const key = transactionStatementKey(transaction)
      const current = latestByKey.get(key)
      const currentIsTargetMonth = current ? isTransactionInMonth(current, nextStatementYear, nextStatementMonth) : false
      const transactionIsTargetMonth = isTransactionInMonth(transaction, nextStatementYear, nextStatementMonth)

      if (
        !current ||
        (transactionIsTargetMonth && !currentIsTargetMonth) ||
        (transactionIsTargetMonth === currentIsTargetMonth && transaction.transaction_date > current.transaction_date)
      ) {
        latestByKey.set(key, transaction)
      }
    }

    const rows = Array.from(latestByKey.values()).sort((a, b) =>
      (a.credit_card?.name || "").localeCompare(b.credit_card?.name || "") ||
      a.description.localeCompare(b.description)
    )

    if (consumptionCardFilter === "all") return rows
    return rows.filter((transaction) => transaction.credit_card_id === consumptionCardFilter)
  }, [consumptionCardFilter, nextStatementMonth, nextStatementYear, statementTransactions])
  const automaticDebitHref = `/dashboard/transacciones/nuevo?type=expense&payment=credit&recurring=1&back=/dashboard/tarjetas&redirect=/dashboard/tarjetas${
    consumptionCardFilter === "all" ? "" : `&cardId=${encodeURIComponent(consumptionCardFilter)}`
  }`

  const openNewDialog = () => {
    setEditingCard(null)
    setForm({ ...emptyCardForm, currency_id: defaultCurrencyId })
    setError(null)
    setDialogOpen(true)
  }

  const openEditDialog = (card: CreditCard) => {
    setEditingCard(card)
    setForm(cardToForm(card))
    setError(null)
    setDialogOpen(true)
  }

  const saveCard = async () => {
    if (!form.name.trim()) {
      setError("El nombre es requerido")
      return
    }
    if (form.last_four && !/^[0-9]{4}$/.test(form.last_four)) {
      setError("Los últimos 4 dígitos deben ser numéricos")
      return
    }
    if (form.credit_limit && Number(form.credit_limit) < 0) {
      setError("El limite no puede ser negativo")
      return
    }
    const closingDay = Number(form.closing_day)
    const dueDay = Number(form.due_day)
    if (form.closing_day && (closingDay < 1 || closingDay > 31)) {
      setError("El dia de cierre debe estar entre 1 y 31")
      return
    }
    if (form.due_day && (dueDay < 1 || dueDay > 31)) {
      setError("El dia de vencimiento debe estar entre 1 y 31")
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
        brand: form.brand === "__none" ? null : form.brand,
        last_four: form.last_four.trim() || null,
        credit_limit: form.credit_limit ? Number(form.credit_limit) : null,
        closing_day: form.closing_day ? Number(form.closing_day) : null,
        due_day: form.due_day ? Number(form.due_day) : null,
        currency_id: form.currency_id || null,
        is_active: form.is_active,
      }

      const result = editingCard
        ? await supabase.from("credit_cards").update(payload).eq("id", editingCard.id)
        : await supabase.from("credit_cards").insert(payload)

      if (result.error) throw result.error

      mutate((key) => key === "credit-cards" || (Array.isArray(key) && key[0] === "credit-cards"))
      mutate((key) => key === "credit-card-purchases" || (Array.isArray(key) && key[0] === "credit-card-purchases"))
      setDialogOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la tarjeta")
    } finally {
      setIsSubmitting(false)
    }
  }

  const setCardActive = async (card: CreditCard, isActive: boolean) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("credit_cards")
      .update({ is_active: isActive })
      .eq("id", card.id)

    if (error) {
      setError(error.message)
      return
    }
    mutate((key) => key === "credit-cards" || (Array.isArray(key) && key[0] === "credit-cards"))
    mutate((key) => key === "credit-card-purchases" || (Array.isArray(key) && key[0] === "credit-card-purchases"))
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Tarjetas de crédito</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar tarjeta..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                />
              </div>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href="/dashboard/tarjetas/compra">
                  <CreditCardIcon className="mr-2 h-4 w-4" />
                  Compra
                </Link>
              </Button>
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <Link href={automaticDebitHref}>
                  <Repeat className="mr-2 h-4 w-4" />
                  Débito automático
                </Link>
              </Button>
              <Button onClick={openNewDialog} className="w-full sm:w-auto">
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
          ) : visibleCards.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No hay tarjetas registradas</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarjeta</TableHead>
                    <TableHead>Marca</TableHead>
                    <TableHead className="text-right">Límite</TableHead>
                    <TableHead>Cierre</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleCards.map((card) => (
                    <TableRow key={card.id}>
                      <TableCell className="font-medium">
                        {card.name}
                        {card.last_four && (
                          <span className="ml-2 text-muted-foreground">**** {card.last_four}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CardBrandMark brand={card.brand} />
                          <span>{getCardBrandLabel(card.brand)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {card.credit_limit ? formatCurrency(Number(card.credit_limit), card.currency) : "-"}
                      </TableCell>
                      <TableCell>{card.closing_day ? `Día ${card.closing_day}` : "-"}</TableCell>
                      <TableCell>{card.due_day ? `Día ${card.due_day}` : "-"}</TableCell>
                      <TableCell>
                        <Badge variant={card.is_active ? "secondary" : "outline"}>
                          {card.is_active ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(card)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setCardActive(card, !card.is_active)}>
                              <XCircle className="mr-2 h-4 w-4" />
                              {card.is_active ? "Desactivar" : "Activar"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(cards || []).filter((card) => card.is_active).map((card) => (
          <Card key={`statement-${card.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm text-muted-foreground">
                  Próximo pago
                </CardTitle>
                <CardBrandMark brand={card.brand} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{card.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {String(nextStatementMonth).padStart(2, "0")}/{nextStatementYear}
                  </p>
                </div>
                <p className="text-xl font-bold font-mono">
                  {formatCurrency(nextStatementTotals.get(card.id) || 0, card.currency)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Compras en cuotas activas</CardTitle>
            <Select value={consumptionCardFilter} onValueChange={setConsumptionCardFilter}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Filtrar por tarjeta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las tarjetas</SelectItem>
                {(cards || []).map((card) => (
                  <SelectItem key={card.id} value={card.id} textValue={`${card.name} ${card.brand || ""} ${card.last_four || ""}`}>
                    <CreditCardSelectLabel card={card} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {purchasesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPurchases.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {consumptionCardFilter === "all" ? "No hay compras en cuotas activas" : "No hay compras en cuotas para esta tarjeta"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Compra</TableHead>
                    <TableHead>Tarjeta</TableHead>
                    <TableHead>Compra</TableHead>
                    <TableHead>Primer vencimiento</TableHead>
                    <TableHead>Cuotas</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Cuota</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPurchases.map((purchase) => (
                    <TableRow key={purchase.id}>
                      <TableCell className="font-medium">{purchase.description}</TableCell>
                      <TableCell>
                        {purchase.credit_card ? <CreditCardSelectLabel card={purchase.credit_card} /> : "-"}
                      </TableCell>
                      <TableCell>{(dateOnlyToLocalDate(purchase.start_date) || new Date(purchase.start_date)).toLocaleDateString("es-AR")}</TableCell>
                      <TableCell>
                        {(dateOnlyToLocalDate(getCreditCardStatementDueDate(purchase.start_date, purchase.credit_card)) || new Date(purchase.start_date)).toLocaleDateString("es-AR")}
                      </TableCell>
                      <TableCell>{purchase.current_installment}/{purchase.total_installments}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(purchase.total_amount), purchase.credit_card?.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(Number(purchase.installment_amount), purchase.credit_card?.currency)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/tarjetas/compra/${purchase.id}`}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Editar
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Débitos automáticos activos</CardTitle>
            <Select value={consumptionCardFilter} onValueChange={setConsumptionCardFilter}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Filtrar por tarjeta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las tarjetas</SelectItem>
                {(cards || []).map((card) => (
                  <SelectItem key={card.id} value={card.id} textValue={`${card.name} ${card.brand || ""} ${card.last_four || ""}`}>
                    <CreditCardSelectLabel card={card} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!statementTransactions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : recurringCardDebits.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {consumptionCardFilter === "all" ? "No hay débitos automáticos activos" : "No hay débitos automáticos para esta tarjeta"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Servicio</TableHead>
                  <TableHead>Tarjeta</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Próximo impacto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recurringCardDebits.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">{transaction.description}</TableCell>
                    <TableCell>
                      {transaction.credit_card ? <CreditCardSelectLabel card={transaction.credit_card} /> : "-"}
                    </TableCell>
                    <TableCell>{transaction.category?.name || "-"}</TableCell>
                    <TableCell>
                      {(dateOnlyToLocalDate(transaction.transaction_date) || new Date(transaction.transaction_date)).toLocaleDateString("es-AR")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(Number(transaction.budgeted_amount || transaction.amount || 0), transaction.currency)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={transaction.status === "pending" ? "outline" : "secondary"}>
                        {transaction.status === "pending" ? "Pendiente" : "Activo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/transacciones/${transaction.id}`}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Editar
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCard ? "Editar tarjeta" : "Nueva tarjeta"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Marca</Label>
                <Select value={form.brand} onValueChange={(value) => setForm({ ...form, brand: value })}>
                  <SelectTrigger id="brand">
                    <SelectValue placeholder="Seleccionar marca" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_BRANDS.map((brand) => (
                      <SelectItem key={brand.value} value={brand.value}>
                        <span className="flex items-center gap-2">
                          <CardBrandMark brand={brand.value} />
                          {brand.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="last_four">Últimos 4</Label>
                <Input id="last_four" maxLength={4} value={form.last_four} onChange={(event) => setForm({ ...form, last_four: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="closing_day">Cierre</Label>
                <Input id="closing_day" min={1} max={31} type="number" value={form.closing_day} onChange={(event) => setForm({ ...form, closing_day: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_day">Vencimiento</Label>
                <Input id="due_day" min={1} max={31} type="number" value={form.due_day} onChange={(event) => setForm({ ...form, due_day: event.target.value })} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="credit_limit">Límite</Label>
                <Input id="credit_limit" type="number" step="0.01" value={form.credit_limit} onChange={(event) => setForm({ ...form, credit_limit: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={form.currency_id} onValueChange={(value) => setForm({ ...form, currency_id: value })}>
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
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Tarjeta activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={saveCard} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
