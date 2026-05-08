"use client"

import { useMemo, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Transaction } from "@/lib/types"
import { formatCurrency } from "@/lib/currency"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, MoreHorizontal, Pencil, Trash2, Search, Plus, Loader2, XCircle } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { mutate } from "swr"
import { dateOnlyToLocalDate } from "@/lib/date-only"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface TransactionListProps {
  transactions: Transaction[]
  type: "expense" | "income" | "all"
  isLoading?: boolean
}

export function TransactionList({ transactions, type, isLoading }: TransactionListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [recurrenceFilter, setRecurrenceFilter] = useState("all")
  const [paymentFilter, setPaymentFilter] = useState("all")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [approvalTransaction, setApprovalTransaction] = useState<Transaction | null>(null)
  const [approvalAmount, setApprovalAmount] = useState("")

  const paymentMethodLabels: Record<string, string> = {
    cash: "Efectivo",
    debit: "Débito",
    credit: "Crédito",
    transfer: "Transferencia",
  }

  const getCreditCardLabel = (transaction: Transaction) => {
    if (!transaction.credit_card) return "Tarjeta sin identificar"
    const lastFour = transaction.credit_card.last_four ? ` **** ${transaction.credit_card.last_four}` : ""
    return `${transaction.credit_card.name}${lastFour}`
  }

  const paymentOptions = useMemo(() => {
    const options = new Map<string, string>()

    for (const transaction of transactions) {
      if (transaction.type !== "expense") continue

      if (!transaction.payment_method) {
        options.set("none", "Sin método")
        continue
      }

      if (transaction.payment_method === "credit") {
        options.set("method:credit", "Crédito (todas)")
        options.set(`card:${transaction.credit_card_id || "unknown"}`, getCreditCardLabel(transaction))
        continue
      }

      options.set(`method:${transaction.payment_method}`, paymentMethodLabels[transaction.payment_method] || transaction.payment_method)
    }

    return Array.from(options.entries()).sort(([, a], [, b]) => a.localeCompare(b))
  }, [transactions])

  const filteredTransactions = transactions
    .filter((transaction) => {
      const query = searchQuery.trim().toLowerCase()
      const matchesSearch = !query || [
        transaction.description,
        transaction.category?.name || "",
        transaction.group?.name || "",
        transaction.credit_card ? getCreditCardLabel(transaction) : "",
      ].some((value) => value.toLowerCase().includes(query))

      const matchesRecurrence =
        recurrenceFilter === "all" ||
        (recurrenceFilter === "recurring" && transaction.is_recurring) ||
        (recurrenceFilter === "normal" && !transaction.is_recurring)

      const matchesPayment =
        paymentFilter === "all" ||
        (paymentFilter === "none" && !transaction.payment_method) ||
        (paymentFilter.startsWith("method:") && transaction.payment_method === paymentFilter.replace("method:", "")) ||
        (paymentFilter.startsWith("card:") &&
          transaction.payment_method === "credit" &&
          (transaction.credit_card_id || "unknown") === paymentFilter.replace("card:", ""))

      return matchesSearch && matchesRecurrence && matchesPayment
    })
    .sort((left, right) => {
      const rightCreatedAt = new Date(right.created_at || right.transaction_date).getTime()
      const leftCreatedAt = new Date(left.created_at || left.transaction_date).getTime()
      if (rightCreatedAt !== leftCreatedAt) return rightCreatedAt - leftCreatedAt

      const rightDate = new Date(right.transaction_date).getTime()
      const leftDate = new Date(left.transaction_date).getTime()
      return rightDate - leftDate
    })

  const handleDelete = async () => {
    if (!deleteId) return
    setIsDeleting(true)
    setError(null)

    try {
      const supabase = createClient()
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", deleteId)

      if (error) throw error

      mutate((key) => {
        const keyName = Array.isArray(key) ? key[0] : key
        return typeof keyName === "string" && keyName.startsWith("transactions")
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar la transaccion")
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  const requestApproval = (transaction: Transaction) => {
    if (transaction.type === "expense" && transaction.is_recurring) {
      setApprovalTransaction(transaction)
      setApprovalAmount(String(transaction.amount))
      setError(null)
      return
    }

    updateStatus(transaction, "approved")
  }

  const confirmRecurringApproval = () => {
    if (!approvalTransaction) return
    const parsedAmount = Number(approvalAmount)
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Ingresá un monto válido para aprobar el gasto")
      return
    }

    updateStatus(approvalTransaction, "approved", parsedAmount)
  }

  const updateStatus = async (transaction: Transaction, status: "approved" | "rejected", approvedAmount?: number) => {
    setActionId(`${status}-${transaction.id}`)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estás autenticado")

      const payload: Record<string, unknown> = status === "approved"
        ? {
            status,
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          }
        : {
            status,
            archived_at: new Date().toISOString(),
          }

      if (status === "approved" && typeof approvedAmount === "number") {
        const originalAmount = Number(transaction.amount)
        payload.amount = approvedAmount

        if (Math.abs(approvedAmount - originalAmount) >= 0.01) {
          payload.metadata = {
            ...(transaction.metadata || {}),
            approved_amount_change: {
              original_amount: originalAmount,
              approved_amount: approvedAmount,
              changed_at: new Date().toISOString(),
            },
          }
        }
      }

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", transaction.id)

      if (error) throw error
      mutate((key) => {
        const keyName = Array.isArray(key) ? key[0] : key
        return typeof keyName === "string" && keyName.startsWith("transactions")
      })
      if (status === "approved") {
        setApprovalTransaction(null)
        setApprovalAmount("")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar el estado")
    } finally {
      setActionId(null)
    }
  }

  const title = type === "expense" ? "Gastos" : type === "income" ? "Ingresos" : "Transacciones"
  const newUrl = type === "expense"
    ? "/dashboard/gastos/nuevo"
    : type === "income"
      ? "/dashboard/ingresos/nuevo"
      : "/dashboard/transacciones/nuevo"
  const editUrl = type === "expense"
    ? "/dashboard/gastos"
    : type === "income"
      ? "/dashboard/ingresos"
      : "/dashboard/transacciones"
  const hasActiveFilters = Boolean(searchQuery.trim()) || recurrenceFilter !== "all" || paymentFilter !== "all"

  const renderActions = (transaction: Transaction) => {
    const status = transaction.status || "approved"

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "pending" && (
            <>
              <DropdownMenuItem
                onClick={() => requestApproval(transaction)}
                disabled={actionId === `approved-${transaction.id}`}
              >
                {actionId === `approved-${transaction.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Aprobar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => updateStatus(transaction, "rejected")}
                disabled={actionId === `rejected-${transaction.id}`}
              >
                {actionId === `rejected-${transaction.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Rechazar
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href={`${editUrl}/${transaction.id}`}>
              <Pencil className="mr-2 h-4 w-4" />
              Editar
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setDeleteId(transaction.id)}
          >
            {actionId === `rejected-${transaction.id}` ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="truncate">{title}</CardTitle>
              <Button asChild className="shrink-0 lg:hidden">
                <Link href={newUrl}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Link>
              </Button>
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>

              <Select value={recurrenceFilter} onValueChange={setRecurrenceFilter}>
                <SelectTrigger className="w-full lg:w-36">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="normal">Normales</SelectItem>
                  <SelectItem value="recurring">Recurrentes</SelectItem>
                </SelectContent>
              </Select>

              {(type === "expense" || type === "all") && (
                <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                  <SelectTrigger className="w-full lg:w-56">
                    <SelectValue placeholder="Medio de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los medios</SelectItem>
                    {paymentOptions.map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setSearchQuery("")
                    setRecurrenceFilter("all")
                    setPaymentFilter("all")
                  }}
                >
                  Limpiar
                </Button>
              )}

              <Button asChild className="hidden shrink-0 lg:inline-flex">
                <Link href={newUrl}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {hasActiveFilters ? "No se encontraron resultados con los filtros aplicados" : `No hay ${title.toLowerCase()} registrados`}
            </div>
          ) : (
            <>
              <div className="space-y-3 md:hidden">
                {filteredTransactions.map((transaction) => {
                  const status = transaction.status || "approved"
                  const currency = transaction.currency || null
                  const amount = Number(transaction.amount || 0)

                  return (
                    <div key={transaction.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <p className="min-w-0 truncate font-medium">{transaction.description}</p>
                            <p className={cn(
                              "shrink-0 font-mono text-base font-semibold",
                              transaction.type === "income" ? "text-success" : "",
                            )}>
                              {formatCurrency(amount, currency)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(dateOnlyToLocalDate(transaction.transaction_date) || new Date(transaction.transaction_date), "dd/MM/yyyy", { locale: es })}
                          </p>
                        </div>
                        {renderActions(transaction)}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {type === "all" && (
                          <Badge variant={transaction.type === "expense" ? "destructive" : "secondary"}>
                            {transaction.type === "expense" ? "Gasto" : "Ingreso"}
                          </Badge>
                        )}
                        {transaction.is_recurring && <Badge variant="secondary">Recurrente</Badge>}
                        {status === "pending" && <Badge variant="outline">Pendiente</Badge>}
                        {transaction.category?.name && <Badge variant="outline">{transaction.category.name}</Badge>}
                        {transaction.group?.name && <Badge variant="outline">{transaction.group.name}</Badge>}
                      </div>

                      {(type === "expense" || type === "all") && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Medio: {transaction.payment_method ? paymentMethodLabels[transaction.payment_method] : "-"}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="hidden md:block">
                <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Grupo</TableHead>
                    {type === "all" && <TableHead>Tipo</TableHead>}
                    {(type === "expense" || type === "all") && <TableHead>Método</TableHead>}
                    <TableHead className="text-right">Previsto</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead className="text-right">Difer.</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.map((transaction) => {
                    const budgeted = Number(transaction.budgeted_amount || transaction.amount)
                    const status = transaction.status || "approved"
                    const actual = status === "pending" || status === "rejected" ? 0 : Number(transaction.amount)
                    const difference = actual - budgeted
                    const currency = transaction.currency || null

                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(dateOnlyToLocalDate(transaction.transaction_date) || new Date(transaction.transaction_date), "dd/MM/yyyy", { locale: es })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {transaction.description}
                            {transaction.is_recurring && (
                              <Badge variant="secondary" className="text-xs">
                                Recurrente
                              </Badge>
                            )}
                            {status === "pending" && (
                              <Badge variant="outline" className="text-xs">
                                Pendiente
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{transaction.category?.name || "-"}</TableCell>
                        <TableCell>{transaction.group?.name || "-"}</TableCell>
                        {type === "all" && (
                          <TableCell>
                            <Badge variant={transaction.type === "expense" ? "destructive" : "secondary"}>
                              {transaction.type === "expense" ? "Gasto" : "Ingreso"}
                            </Badge>
                          </TableCell>
                        )}
                        {(type === "expense" || type === "all") && (
                          <TableCell>
                            {transaction.payment_method 
                              ? paymentMethodLabels[transaction.payment_method] 
                              : "-"}
                          </TableCell>
                        )}
                        <TableCell className="text-right font-mono">
                          {formatCurrency(budgeted, currency)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(actual, currency)}
                        </TableCell>
                        <TableCell className={`text-right font-mono ${
                          transaction.type === "expense"
                            ? difference > 0 ? "text-destructive" : difference < 0 ? "text-green-600" : ""
                            : difference < 0 ? "text-destructive" : difference > 0 ? "text-green-600" : ""
                        }`}>
                          {difference !== 0 && (difference > 0 ? "+" : "")}
                          {formatCurrency(difference, currency)}
                        </TableCell>
                        <TableCell>
                          {renderActions(transaction)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!approvalTransaction}
        onOpenChange={(open) => {
          if (!open && !actionId) {
            setApprovalTransaction(null)
            setApprovalAmount("")
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar gasto recurrente</DialogTitle>
            <DialogDescription>
              Confirmá si el importe se mantiene o cargá el valor real de este mes. El cambio se guarda solo en esta ocurrencia.
            </DialogDescription>
          </DialogHeader>

          {approvalTransaction && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">{approvalTransaction.description}</p>
                <p className="text-muted-foreground">
                  Previsto: {formatCurrency(Number(approvalTransaction.amount), approvalTransaction.currency || null)}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="approval_amount">Monto real aprobado</Label>
                <Input
                  id="approval_amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={approvalAmount}
                  onChange={(event) => setApprovalAmount(event.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={!!actionId}
              onClick={() => {
                setApprovalTransaction(null)
                setApprovalAmount("")
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={confirmRecurringApproval}
              disabled={
                !approvalTransaction ||
                actionId === `approved-${approvalTransaction.id}` ||
                !Number.isFinite(Number(approvalAmount)) ||
                Number(approvalAmount) <= 0
              }
            >
              {approvalTransaction && actionId === `approved-${approvalTransaction.id}` && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Aprobar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar {type === "expense" ? "gasto" : "ingreso"}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente este registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
