"use client"

import { useState } from "react"
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
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, MoreHorizontal, Pencil, Trash2, Search, Plus, Loader2, XCircle } from "lucide-react"
import Link from "next/link"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { mutate } from "swr"
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

interface TransactionListProps {
  transactions: Transaction[]
  type: "expense" | "income" | "all"
  isLoading?: boolean
}

export function TransactionList({ transactions, type, isLoading }: TransactionListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filteredTransactions = transactions.filter((t) =>
    t.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

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

      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al eliminar la transaccion")
    } finally {
      setIsDeleting(false)
      setDeleteId(null)
    }
  }

  const updateStatus = async (transaction: Transaction, status: "approved" | "rejected") => {
    setActionId(`${status}-${transaction.id}`)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("No estas autenticado")

      const payload = status === "approved"
        ? {
            status,
            approved_at: new Date().toISOString(),
            approved_by: user.id,
          }
        : {
            status,
            archived_at: new Date().toISOString(),
          }

      const { error } = await supabase
        .from("transactions")
        .update(payload)
        .eq("id", transaction.id)

      if (error) throw error
      mutate((key) => typeof key === "string" && key.startsWith("transactions"))
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

  const paymentMethodLabels: Record<string, string> = {
    cash: "Efectivo",
    debit: "Débito",
    credit: "Crédito",
    transfer: "Transferencia",
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{title}</CardTitle>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button asChild>
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
              {searchQuery ? "No se encontraron resultados" : `No hay ${title.toLowerCase()} registrados`}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Grupo</TableHead>
                    {type === "all" && <TableHead>Tipo</TableHead>}
                    {(type === "expense" || type === "all") && <TableHead>Metodo</TableHead>}
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
                          {format(new Date(transaction.transaction_date), "dd/MM/yyyy", { locale: es })}
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
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {transaction.type === "income" && status === "pending" && (
                                <>
                                  <DropdownMenuItem onClick={() => updateStatus(transaction, "approved")}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Aprobar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-destructive" onClick={() => updateStatus(transaction, "rejected")}>
                                    <XCircle className="mr-2 h-4 w-4" />
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
