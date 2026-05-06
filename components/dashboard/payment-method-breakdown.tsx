"use client"

import { CreditCard, Landmark, Wallet, ArrowRightLeft } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/currency"
import type { Currency, Transaction } from "@/lib/types"

type PaymentMethodBreakdownProps = {
  transactions: Transaction[]
  currency: Currency | null
}

type BreakdownItem = {
  key: string
  label: string
  sortOrder: number
  actual: number
  pending: number
}

const methodLabels: Record<string, string> = {
  cash: "Efectivo",
  debit: "Débito",
  transfer: "Transferencia",
}

function getCreditCardLabel(transaction: Transaction) {
  if (!transaction.credit_card) return "Tarjeta sin identificar"

  const suffix = transaction.credit_card.last_four ? ` **** ${transaction.credit_card.last_four}` : ""
  return `${transaction.credit_card.name}${suffix}`
}

function getMethodIcon(key: string) {
  if (key.startsWith("card:")) return CreditCard
  if (key === "transfer") return ArrowRightLeft
  if (key === "debit") return Landmark
  return Wallet
}

export function PaymentMethodBreakdown({ transactions, currency }: PaymentMethodBreakdownProps) {
  const totalsByMethod = new Map<string, BreakdownItem>()

  for (const transaction of transactions) {
    if (transaction.type !== "expense" || transaction.status === "rejected") continue

    const isCredit = transaction.payment_method === "credit"
    const key = isCredit
      ? `card:${transaction.credit_card_id || "unknown"}`
      : transaction.payment_method || "cash"
    const label = isCredit ? getCreditCardLabel(transaction) : methodLabels[key] || "Sin método"
    const sortOrder = isCredit ? 10 : key === "debit" ? 1 : key === "transfer" ? 2 : key === "cash" ? 3 : 9
    const current = totalsByMethod.get(key) || { key, label, sortOrder, actual: 0, pending: 0 }
    const amount = Number(transaction.amount || 0)
    const budgetedAmount = Number(transaction.budgeted_amount || transaction.amount || 0)

    if (transaction.status === "pending") {
      current.pending += budgetedAmount
    } else {
      current.actual += amount
    }

    totalsByMethod.set(key, current)
  }

  const items = Array.from(totalsByMethod.values())
    .filter((item) => item.actual !== 0 || item.pending !== 0)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))

  const actualTotal = items.reduce((total, item) => total + item.actual, 0)
  const pendingTotal = items.reduce((total, item) => total + item.pending, 0)
  const maxTotal = Math.max(...items.map((item) => item.actual + item.pending), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg">Gastos por medio de pago</CardTitle>
            <p className="text-sm text-muted-foreground">Consumo real y pendiente del mes seleccionado</p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-sm text-muted-foreground">Total gastado</p>
            <p className="font-mono text-xl font-semibold">{formatCurrency(actualTotal, currency)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No hay gastos registrados para este mes.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = getMethodIcon(item.key)
              const total = item.actual + item.pending
              const width = Math.max((total / maxTotal) * 100, 4)

              return (
                <div key={item.key} className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(260px,2fr)] sm:items-center">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="truncate font-medium">{item.label}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-mono font-semibold">{formatCurrency(item.actual, currency)}</span>
                      {item.pending > 0 && (
                        <span className="text-xs text-muted-foreground">
                          Pendiente {formatCurrency(item.pending, currency)}
                        </span>
                      )}
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                </div>
              )
            })}

            {pendingTotal > 0 && (
              <div className="border-t pt-3 text-sm text-muted-foreground">
                Pendiente de aprobación: <span className="font-mono">{formatCurrency(pendingTotal, currency)}</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
