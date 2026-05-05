"use client"

import { RecurringIncomeManagement } from "@/components/incomes/recurring-income-management"
import { TransactionList } from "@/components/transactions/transaction-list"
import { useMonthlyTransactions } from "@/components/dashboard/use-dashboard-data"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function IngresosPage() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  const income = transactions?.filter((t) => t.type === "income") || []

  return (
    <Tabs defaultValue="movements" className="space-y-4">
      <TabsList className="flex h-auto flex-wrap justify-start">
        <TabsTrigger value="movements">Ingresos</TabsTrigger>
        <TabsTrigger value="recurring">Recurrentes</TabsTrigger>
      </TabsList>

      <TabsContent value="movements">
        <TransactionList
          transactions={income}
          type="income"
          isLoading={isLoading}
        />
      </TabsContent>

      <TabsContent value="recurring">
        <RecurringIncomeManagement />
      </TabsContent>
    </Tabs>
  )
}
