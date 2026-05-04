"use client"

import { TransactionList } from "@/components/transactions/transaction-list"
import { useMonthlyTransactions } from "@/components/dashboard/use-dashboard-data"

export default function GastosPage() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  const expenses = transactions?.filter((t) => t.type === "expense") || []

  return (
    <TransactionList
      transactions={expenses}
      type="expense"
      isLoading={isLoading}
    />
  )
}
