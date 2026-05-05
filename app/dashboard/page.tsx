"use client"

import { SummaryCards } from "@/components/dashboard/summary-cards"
import { ExpenseIncomeTable } from "@/components/dashboard/expense-income-table"
import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { SavingsOverview } from "@/components/dashboard/savings-overview"
import { useCurrencies, useMonthlySummary, useMonthlyTransactions, useYearlyTransactions, useCreditCardPurchases, useUserSettings } from "@/components/dashboard/use-dashboard-data"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import type { GroupSummary } from "@/lib/types"
import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"

export default function DashboardPage() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { summary, isLoading: summaryLoading } = useMonthlySummary()
  const { data: monthlyTransactions, isLoading: transactionsLoading } = useMonthlyTransactions()
  const { data: yearlyTransactions, isLoading: yearlyLoading } = useYearlyTransactions()
  const { data: creditCardPurchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()

  const isLoading = summaryLoading || transactionsLoading || yearlyLoading || purchasesLoading
  const currency = settings?.default_currency || currencies?.find((item) => item.code === "ARS") || currencies?.[0] || null

  // Process transactions for expense/income table
  const expensesByGroup: Record<string, GroupSummary> = {}
  const incomeByCategory: Record<string, GroupSummary> = {}

  if (monthlyTransactions) {
    monthlyTransactions.forEach((t) => {
      const actualAmount = t.status === "pending" || t.status === "rejected" ? 0 : Number(t.amount)
      const budgetedAmount = t.status === "rejected" ? 0 : Number(t.budgeted_amount || t.amount)
      if (t.type === "expense") {
        const groupKey = t.group_id || "ungrouped"
        if (!expensesByGroup[groupKey]) {
          expensesByGroup[groupKey] = { group: t.group || null, budgeted: 0, actual: 0, difference: 0, categories: [] }
        }
        expensesByGroup[groupKey].actual += actualAmount
        expensesByGroup[groupKey].budgeted += budgetedAmount
        expensesByGroup[groupKey].difference = expensesByGroup[groupKey].actual - expensesByGroup[groupKey].budgeted
      } else {
        const groupKey = t.category_id || "other-income"
        if (!incomeByCategory[groupKey]) {
          incomeByCategory[groupKey] = {
            group: t.category
              ? {
                  id: t.category.id,
                  user_id: t.category.user_id,
                  name: t.category.name,
                  description: null,
                  color: t.category.color,
                  created_at: t.category.created_at,
                }
              : null,
            budgeted: 0,
            actual: 0,
            difference: 0,
            categories: [],
          }
        }
        incomeByCategory[groupKey].actual += actualAmount
        incomeByCategory[groupKey].budgeted += budgetedAmount
        incomeByCategory[groupKey].difference = incomeByCategory[groupKey].actual - incomeByCategory[groupKey].budgeted
      }
    })
  }

  // Process yearly data for projection chart
  const monthlyData: { month: number; year: number; income: number; expenses: number; savings: number }[] = []
  
  for (let i = 0; i < 12; i++) {
    const monthData = { month: i + 1, year: selectedYear, income: 0, expenses: 0, savings: 0 }
    
    if (yearlyTransactions) {
      yearlyTransactions.forEach((t) => {
        if (getMonthIndexFromDateOnly(t.transaction_date) === i) {
          const projectedAmount = t.status === "rejected" ? 0 : Number(t.amount)
          if (t.type === "income") {
            monthData.income += projectedAmount
          } else {
            monthData.expenses += projectedAmount
          }
        }
      })
    }
    
    // Add projected credit card installments for future months
    if (i >= selectedMonth - 1 && creditCardPurchases) {
      creditCardPurchases.forEach((purchase) => {
        const startMonth = getMonthIndexFromDateOnly(purchase.start_date)
        const startYear = getYearFromDateOnly(purchase.start_date)
        const monthsSinceStart = (selectedYear - startYear) * 12 + i - startMonth
        
        if (monthsSinceStart >= 0 && monthsSinceStart < purchase.total_installments) {
          monthData.expenses += Number(purchase.installment_amount)
        }
      })
    }
    
    monthData.savings = monthData.income - monthData.expenses
    monthlyData.push(monthData)
  }

  const previousMonthSavings = monthlyData[selectedMonth - 2]?.savings || 0
  const yearToDateSavings = monthlyData.slice(0, selectedMonth).reduce((total, item) => total + item.savings, 0)

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
        initialBalance={settings?.initial_balance || 0}
        finalBalance={(settings?.initial_balance || 0) + summary.savings}
        totalIncome={summary.totalIncome}
        totalExpenses={summary.totalExpenses}
        budgetedIncome={summary.budgetedIncome}
        budgetedExpenses={summary.budgetedExpenses}
        savings={summary.savings}
        currency={currency}
      />

      {/* Expense/Income Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExpenseIncomeTable
          type="expense"
          expenseGroups={Object.values(expensesByGroup)}
          incomeGroups={Object.values(incomeByCategory)}
          currency={currency}
        />
        <ExpenseIncomeTable
          type="income"
          expenseGroups={Object.values(expensesByGroup)}
          incomeGroups={Object.values(incomeByCategory)}
          currency={currency}
        />
      </div>

      {/* Annual Projection */}
      <AnnualProjectionChart
        data={monthlyData}
        currentMonth={selectedMonth}
        currentYear={selectedYear}
        currency={currency}
      />

      {/* Savings Overview */}
      <SavingsOverview
        data={{
          currentMonth: summary.savings,
          previousMonth: previousMonthSavings,
          monthlyTarget: settings?.monthly_savings_target || 0,
          yearToDate: yearToDateSavings,
          yearTarget: settings?.annual_savings_target || 0,
        }}
        currency={currency}
      />
    </div>
  )
}
