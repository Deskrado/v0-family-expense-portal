"use client"

import { TransactionList } from "@/components/transactions/transaction-list"
import { useMonthlyTransactions } from "@/components/dashboard/use-dashboard-data"

export default function IngresosPage() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  const income = transactions?.filter((t) => t.type === "income") || []

  return (
    <TransactionList
      transactions={income}
      type="income"
      isLoading={isLoading}
    />
  )
}
