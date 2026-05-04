"use client"

import { SummaryCards } from "@/components/dashboard/summary-cards"
import { ExpenseIncomeTable } from "@/components/dashboard/expense-income-table"
import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { SavingsOverview } from "@/components/dashboard/savings-overview"
import { useMonthlySummary, useMonthlyTransactions, useYearlyTransactions, useCreditCardPurchases } from "@/components/dashboard/use-dashboard-data"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"

export default function DashboardPage() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { summary, isLoading: summaryLoading } = useMonthlySummary()
  const { data: monthlyTransactions, isLoading: transactionsLoading } = useMonthlyTransactions()
  const { data: yearlyTransactions, isLoading: yearlyLoading } = useYearlyTransactions()
  const { data: creditCardPurchases, isLoading: purchasesLoading } = useCreditCardPurchases()

  const isLoading = summaryLoading || transactionsLoading || yearlyLoading || purchasesLoading

  // Process transactions for expense/income table
  const expensesByGroup: Record<string, { name: string; budgeted: number; actual: number }> = {}
  const incomeByCategory: Record<string, { name: string; budgeted: number; actual: number }> = {}

  if (monthlyTransactions) {
    monthlyTransactions.forEach((t) => {
      if (t.type === "expense") {
        const groupName = t.group?.name || "Sin Grupo"
        if (!expensesByGroup[groupName]) {
          expensesByGroup[groupName] = { name: groupName, budgeted: 0, actual: 0 }
        }
        expensesByGroup[groupName].actual += Number(t.amount)
        expensesByGroup[groupName].budgeted += Number(t.budgeted_amount || t.amount)
      } else {
        const categoryName = t.category?.name || "Otros Ingresos"
        if (!incomeByCategory[categoryName]) {
          incomeByCategory[categoryName] = { name: categoryName, budgeted: 0, actual: 0 }
        }
        incomeByCategory[categoryName].actual += Number(t.amount)
        incomeByCategory[categoryName].budgeted += Number(t.budgeted_amount || t.amount)
      }
    })
  }

  // Process yearly data for projection chart
  const monthlyData: { month: string; income: number; expenses: number; savings: number }[] = []
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
  
  for (let i = 0; i < 12; i++) {
    const monthData = { month: monthNames[i], income: 0, expenses: 0, savings: 0 }
    
    if (yearlyTransactions) {
      yearlyTransactions.forEach((t) => {
        const date = new Date(t.transaction_date)
        if (date.getMonth() === i) {
          if (t.type === "income") {
            monthData.income += Number(t.amount)
          } else {
            monthData.expenses += Number(t.amount)
          }
        }
      })
    }
    
    // Add projected credit card installments for future months
    if (i >= selectedMonth - 1 && creditCardPurchases) {
      creditCardPurchases.forEach((purchase) => {
        const startDate = new Date(purchase.start_date)
        const startMonth = startDate.getMonth()
        const startYear = startDate.getFullYear()
        const monthsSinceStart = (selectedYear - startYear) * 12 + i - startMonth
        
        if (monthsSinceStart >= 0 && monthsSinceStart < purchase.total_installments) {
          monthData.expenses += Number(purchase.installment_amount)
        }
      })
    }
    
    monthData.savings = monthData.income - monthData.expenses
    monthlyData.push(monthData)
  }

  // Calculate savings history for the chart
  const savingsHistory = monthlyData.slice(0, selectedMonth).map((d) => ({
    month: d.month,
    amount: d.savings,
  }))

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/dashboard/gastos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Gasto
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard/ingresos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Ingreso
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        initialBalance={0}
        finalBalance={summary.savings}
        monthSavings={summary.savings}
        totalIncome={summary.totalIncome}
        totalExpenses={summary.totalExpenses}
        budgetedIncome={summary.budgetedIncome}
        budgetedExpenses={summary.budgetedExpenses}
        isLoading={isLoading}
      />

      {/* Expense/Income Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpenseIncomeTable
          title="Gastos"
          type="expense"
          data={Object.values(expensesByGroup)}
          isLoading={isLoading}
        />
        <ExpenseIncomeTable
          title="Ganancias"
          type="income"
          data={Object.values(incomeByCategory)}
          isLoading={isLoading}
        />
      </div>

      {/* Annual Projection */}
      <AnnualProjectionChart
        data={monthlyData}
        currentMonth={selectedMonth}
        isLoading={isLoading}
      />

      {/* Savings Overview */}
      <SavingsOverview
        currentSavings={summary.savings}
        savingsRate={summary.savingsRate}
        monthlyTarget={500000}
        savingsHistory={savingsHistory}
        isLoading={isLoading}
      />
    </div>
  )
}
