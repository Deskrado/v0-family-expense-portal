"use client"

import { SummaryCards } from "@/components/dashboard/summary-cards"
import { ExpenseIncomeTable } from "@/components/dashboard/expense-income-table"
import { AnnualProjectionChart } from "@/components/dashboard/annual-projection-chart"
import { PaymentMethodBreakdown } from "@/components/dashboard/payment-method-breakdown"
import { SavingsOverview } from "@/components/dashboard/savings-overview"
import {
  useBrokerPositions,
  useCategories,
  useCreditCardPurchases,
  useCurrencies,
  useFxQuotes,
  useInvestments,
  useMonthlySummary,
  useMonthlyTransactions,
  usePortfolioSnapshots,
  useRecurringIncomeTemplates,
  useSavingsGoals,
  useUserSettings,
  useYearlyTransactions,
  useFamilyVisibility,
} from "@/components/dashboard/use-dashboard-data"
import { useDashboard } from "@/components/dashboard/dashboard-context"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import Link from "next/link"
import type { GroupSummary } from "@/lib/types"
import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"
import { getRecurringProjectionForMonth } from "@/lib/recurring-projection"
import { getCreditCardInstallmentDueDate } from "@/lib/credit-card-billing"
import { getWealthBreakdown } from "@/lib/wealth-summary"
import { canSeeModule } from "@/lib/family-visibility"

export default function DashboardPage() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { summary, isLoading: summaryLoading } = useMonthlySummary()
  const { data: monthlyTransactions, isLoading: transactionsLoading } = useMonthlyTransactions()
  const { data: yearlyTransactions, isLoading: yearlyLoading } = useYearlyTransactions()
  const { data: creditCardPurchases, isLoading: purchasesLoading } = useCreditCardPurchases()
  const { data: recurringIncomeTemplates } = useRecurringIncomeTemplates()
  const { data: categories } = useCategories()
  const { data: investments } = useInvestments()
  const { data: brokerPositions } = useBrokerPositions()
  const { data: portfolioSnapshots } = usePortfolioSnapshots()
  const { data: savingsGoals } = useSavingsGoals()
  const { data: fxQuotes } = useFxQuotes()
  const { data: currencies } = useCurrencies()
  const { data: settings } = useUserSettings()
  const { data: visibility } = useFamilyVisibility()

  const isLoading = summaryLoading || transactionsLoading || yearlyLoading || purchasesLoading
  const currency = settings?.default_currency || currencies?.find((item) => item.code === "ARS") || currencies?.[0] || null
  const canViewInvestments = canSeeModule("investments", visibility?.membership, visibility?.permissions)
  const projectedCategories = (categories || []).filter(
    (category) => category.type === "expense" && category.projection_method === "historical_average",
  )
  const projectedCategoryIds = new Set(projectedCategories.map((category) => category.id))
  const getHistoricalAverageForCategory = (categoryId: string, targetYear: number, targetMonthIndex: number, monthsBack: number) => {
    const targetIndex = targetYear * 12 + targetMonthIndex
    const windowMonthlyTotals = new Map<number, number>()
    const previousMonthlyTotals = new Map<number, number>()

    for (const transaction of yearlyTransactions || []) {
      if (transaction.status === "rejected") continue
      if (transaction.type !== "expense") continue
      if (transaction.is_recurring) continue
      if (transaction.credit_card_purchase_id) continue
      if (transaction.category_id !== categoryId) continue

      const amount = Number(transaction.amount || 0)
      if (amount <= 0) continue

      const transactionIndex = getYearFromDateOnly(transaction.transaction_date) * 12 + getMonthIndexFromDateOnly(transaction.transaction_date)
      if (transactionIndex >= targetIndex) continue

      previousMonthlyTotals.set(transactionIndex, (previousMonthlyTotals.get(transactionIndex) || 0) + amount)
      if (transactionIndex < targetIndex - monthsBack) continue

      windowMonthlyTotals.set(transactionIndex, (windowMonthlyTotals.get(transactionIndex) || 0) + amount)
    }

    const windowValues = Array.from(windowMonthlyTotals.values()).filter((value) => value > 0)
    if (windowValues.length > 0) {
      return windowValues.reduce((total, value) => total + value, 0) / windowValues.length
    }

    const latestMonthWithExpense = Math.max(...Array.from(previousMonthlyTotals.keys()))
    if (!Number.isFinite(latestMonthWithExpense)) return 0
    return previousMonthlyTotals.get(latestMonthWithExpense) || 0
  }

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
    const monthIndex = selectedYear * 12 + i
    const selectedIndex = selectedYear * 12 + (selectedMonth - 1)
    const categoriesWithActualExpense = new Set<string>()
    
    if (yearlyTransactions) {
      yearlyTransactions.forEach((t) => {
        if (getYearFromDateOnly(t.transaction_date) === selectedYear && getMonthIndexFromDateOnly(t.transaction_date) === i) {
          const projectedAmount = t.status === "rejected" ? 0 : Number(t.amount)
          if (t.type === "income") {
            monthData.income += projectedAmount
          } else {
            monthData.expenses += projectedAmount
            if (t.category_id && projectedCategoryIds.has(t.category_id)) {
              categoriesWithActualExpense.add(t.category_id)
            }
          }
        }
      })
    }

    const recurringProjection = getRecurringProjectionForMonth(yearlyTransactions, selectedYear, i, selectedYear, selectedMonth, recurringIncomeTemplates)
    monthData.income += recurringProjection.income
    monthData.expenses += recurringProjection.expenses
    
    if (creditCardPurchases) {
      creditCardPurchases.forEach((purchase) => {
        for (let installmentIndex = 0; installmentIndex < purchase.total_installments; installmentIndex += 1) {
          const installmentDueDate = getCreditCardInstallmentDueDate(purchase.start_date, purchase.credit_card, installmentIndex)
          if (getYearFromDateOnly(installmentDueDate) !== selectedYear || getMonthIndexFromDateOnly(installmentDueDate) !== i) continue

          const hasCurrentTransaction = (purchase.transactions || []).some(
            (transaction) => Number(transaction.installment_number || 0) === installmentIndex + 1,
          )
          if (hasCurrentTransaction) return
          monthData.expenses += Number(purchase.installment_amount)
        }
      })
    }

    if (monthIndex > selectedIndex) {
      for (const category of projectedCategories) {
        if (categoriesWithActualExpense.has(category.id)) continue

        monthData.expenses += getHistoricalAverageForCategory(
          category.id,
          selectedYear,
          i,
          Math.max(Number(category.projection_months || 3), 1),
        )
      }
    }
    
    monthData.savings = monthData.income - monthData.expenses
    monthlyData.push(monthData)
  }

  const configuredInitialBalance = settings?.initial_balance || 0
  const priorMonthsSavings = monthlyData.slice(0, selectedMonth - 1).reduce((total, item) => total + item.savings, 0)
  const previousMonthSavings = monthlyData[selectedMonth - 2]?.savings || 0
  const yearToDateSavings = priorMonthsSavings + summary.savings
  const monthInitialBalance = configuredInitialBalance + priorMonthsSavings
  const cashBalance = monthInitialBalance + summary.savings
  const wealthBreakdown = getWealthBreakdown({
    cashBalance,
    investments,
    brokerPositions,
    portfolioSnapshots,
    savingsGoals,
    fxQuotes,
    defaultCurrency: currency,
  })

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <Button className="w-full sm:w-auto" asChild>
          <Link href="/dashboard/gastos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Gasto
          </Link>
        </Button>
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link href="/dashboard/ingresos/nuevo">
            <Plus className="mr-2 h-4 w-4" />
            Agregar Ingreso
          </Link>
        </Button>
      </div>

      {/* Summary Cards */}
      <SummaryCards
        initialBalance={monthInitialBalance}
        finalBalance={cashBalance}
        totalIncome={summary.totalIncome}
        totalExpenses={summary.totalExpenses}
        budgetedIncome={summary.budgetedIncome}
        budgetedExpenses={summary.budgetedExpenses}
        savings={summary.savings}
        currency={currency}
        wealth={wealthBreakdown}
        showInvestments={canViewInvestments}
      />

      <PaymentMethodBreakdown transactions={monthlyTransactions || []} currency={currency} />

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
        wealth={wealthBreakdown}
      />
    </div>
  )
}
