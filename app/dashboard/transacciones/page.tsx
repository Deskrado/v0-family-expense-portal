"use client"

import { TransactionList } from "@/components/transactions/transaction-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useMonthlyTransactions } from "@/components/dashboard/use-dashboard-data"

export default function TransaccionesPage() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  const all = transactions || []

  return (
    <Tabs defaultValue="all" className="space-y-4">
      <TabsList>
        <TabsTrigger value="all">Todas</TabsTrigger>
        <TabsTrigger value="expenses">Gastos</TabsTrigger>
        <TabsTrigger value="income">Ingresos</TabsTrigger>
      </TabsList>

      <TabsContent value="all">
        <TransactionList transactions={all} type="all" isLoading={isLoading} />
      </TabsContent>
      <TabsContent value="expenses">
        <TransactionList
          transactions={all.filter((transaction) => transaction.type === "expense")}
          type="expense"
          isLoading={isLoading}
        />
      </TabsContent>
      <TabsContent value="income">
        <TransactionList
          transactions={all.filter((transaction) => transaction.type === "income")}
          type="income"
          isLoading={isLoading}
        />
      </TabsContent>
    </Tabs>
  )
}
