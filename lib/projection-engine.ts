import { getCreditCardInstallmentDueDate } from "@/lib/credit-card-billing"
import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"
import { getRecurringProjectionForMonth } from "@/lib/recurring-projection"
import type {
  Category,
  CreditCardPurchase,
  ProjectionScenario,
  ProjectionScenarioItem,
  RecurringIncomeTemplate,
  Transaction,
} from "@/lib/types"

export type MonthlyProjectionPoint = {
  month: number
  year: number
  income: number
  expenses: number
  actualIncome: number
  actualExpenses: number
  recurringIncome: number
  recurringExpenses: number
  installments: number
  essentialProjection: number
  scenarioImpact: number
  simulatedExpenses: number
  savings: number
  simulatedSavings: number
  cumulativeSavings: number
  simulatedCumulativeSavings: number
  activeScenarioItems: ProjectionScenarioItem[]
}

type BuildProjectionInput = {
  year: number
  selectedMonth: number
  startMonth?: number
  startYear?: number
  monthsAhead?: number
  transactions?: Transaction[]
  purchases?: CreditCardPurchase[]
  recurringIncomeTemplates?: RecurringIncomeTemplate[]
  categories?: Category[]
  scenarios?: ProjectionScenario[]
}

function getPeriodIndex(year: number, month: number) {
  return year * 12 + (month - 1)
}

function getHistoricalAverageForCategory(
  categoryId: string,
  targetYear: number,
  targetMonthIndex: number,
  monthsBack: number,
  transactions: Transaction[] | undefined,
) {
  const targetIndex = targetYear * 12 + targetMonthIndex
  const windowMonthlyTotals = new Map<number, number>()
  const previousMonthlyTotals = new Map<number, number>()

  for (const transaction of transactions || []) {
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

function isScenarioItemActiveForMonth(item: ProjectionScenarioItem, year: number, month: number) {
  const targetIndex = getPeriodIndex(year, month)
  const startIndex = getPeriodIndex(item.start_year, item.start_month)
  const endIndex = getPeriodIndex(item.end_year, item.end_month)

  if (item.frequency === "one_time") return targetIndex === startIndex
  return targetIndex >= startIndex && targetIndex <= endIndex
}

function getScenarioItemsForMonth(scenarios: ProjectionScenario[] | undefined, year: number, month: number) {
  return (scenarios || [])
    .filter((scenario) => scenario.is_active)
    .flatMap((scenario) => scenario.items || [])
    .filter((item) => isScenarioItemActiveForMonth(item, year, month))
}

export function buildAnnualProjection({
  year,
  selectedMonth,
  startMonth = 1,
  startYear = year,
  monthsAhead = 12,
  transactions,
  purchases,
  recurringIncomeTemplates,
  categories,
  scenarios,
}: BuildProjectionInput) {
  const projectedCategories = (categories || []).filter(
    (category) => category.type === "expense" && category.projection_method === "historical_average",
  )
  const projectedCategoryIds = new Set(projectedCategories.map((category) => category.id))
  const selectedIndex = getPeriodIndex(year, selectedMonth)
  let cumulativeSavings = 0
  let simulatedCumulativeSavings = 0

  const startPeriodIndex = getPeriodIndex(startYear, startMonth)

  return Array.from({ length: monthsAhead }, (_, offset) => {
    const periodIndex = startPeriodIndex + offset
    const month = (periodIndex % 12) + 1
    const pointYear = Math.floor(periodIndex / 12)
    const monthIndexInYear = month - 1
    const monthIndex = getPeriodIndex(pointYear, month)
    const categoriesWithActualExpense = new Set<string>()
    const point: MonthlyProjectionPoint = {
      month,
      year: pointYear,
      income: 0,
      expenses: 0,
      actualIncome: 0,
      actualExpenses: 0,
      recurringIncome: 0,
      recurringExpenses: 0,
      installments: 0,
      essentialProjection: 0,
      scenarioImpact: 0,
      simulatedExpenses: 0,
      savings: 0,
      simulatedSavings: 0,
      cumulativeSavings: 0,
      simulatedCumulativeSavings: 0,
      activeScenarioItems: [],
    }

    for (const transaction of transactions || []) {
      if (getYearFromDateOnly(transaction.transaction_date) !== pointYear || getMonthIndexFromDateOnly(transaction.transaction_date) !== monthIndexInYear) continue

      const projectedAmount = transaction.status === "rejected" ? 0 : Number(transaction.amount || 0)
      if (transaction.type === "income") {
        point.income += projectedAmount
        point.actualIncome += transaction.status === "pending" ? 0 : projectedAmount
        if (transaction.is_recurring) {
          point.recurringIncome += projectedAmount
        }
      } else {
        point.expenses += projectedAmount
        point.actualExpenses += transaction.status === "pending" ? 0 : projectedAmount
        if (transaction.is_recurring) {
          point.recurringExpenses += projectedAmount
        }
        if (transaction.credit_card_purchase_id && transaction.installment_number) {
          point.installments += projectedAmount
        }
        if (transaction.category_id && projectedCategoryIds.has(transaction.category_id)) {
          categoriesWithActualExpense.add(transaction.category_id)
        }
      }
    }

    const recurringProjection = getRecurringProjectionForMonth(
      transactions,
      pointYear,
      monthIndexInYear,
      year,
      selectedMonth,
      recurringIncomeTemplates,
    )
    point.recurringIncome += recurringProjection.income
    point.recurringExpenses += recurringProjection.expenses
    point.income += recurringProjection.income
    point.expenses += recurringProjection.expenses

    for (const purchase of purchases || []) {
      for (let installmentIndex = 0; installmentIndex < Number(purchase.total_installments || 0); installmentIndex += 1) {
        const installmentDueDate = getCreditCardInstallmentDueDate(purchase.start_date, purchase.credit_card, installmentIndex)
        if (getYearFromDateOnly(installmentDueDate) !== pointYear || getMonthIndexFromDateOnly(installmentDueDate) !== monthIndexInYear) continue

        const hasCurrentTransaction = (purchase.transactions || []).some(
          (transaction) => Number(transaction.installment_number || 0) === installmentIndex + 1,
        )
        if (hasCurrentTransaction) continue
        const installmentAmount = Number(purchase.installment_amount || 0)
        point.installments += installmentAmount
        point.expenses += installmentAmount
      }
    }

    if (monthIndex > selectedIndex) {
      for (const category of projectedCategories) {
        if (categoriesWithActualExpense.has(category.id)) continue

        point.essentialProjection += getHistoricalAverageForCategory(
          category.id,
          pointYear,
          monthIndexInYear,
          Math.max(Number(category.projection_months || 3), 1),
          transactions,
        )
      }
      point.expenses += point.essentialProjection
    }

    point.activeScenarioItems = getScenarioItemsForMonth(scenarios, pointYear, month)
    point.scenarioImpact = point.activeScenarioItems.reduce((total, item) => total + Number(item.amount || 0), 0)
    point.simulatedExpenses = point.expenses + point.scenarioImpact
    point.savings = point.income - point.expenses
    point.simulatedSavings = point.income - point.simulatedExpenses
    cumulativeSavings += point.savings
    simulatedCumulativeSavings += point.simulatedSavings
    point.cumulativeSavings = cumulativeSavings
    point.simulatedCumulativeSavings = simulatedCumulativeSavings

    return point
  })
}

export function getProjectionAlerts(points: MonthlyProjectionPoint[], expenseThresholdPercent = 80) {
  const alerts: { level: "warning" | "danger"; message: string }[] = []
  const negativeMonths = points.filter((point) => point.simulatedSavings < 0)
  const thresholdMonths = points.filter((point) =>
    point.income > 0 && (point.simulatedExpenses / point.income) * 100 >= expenseThresholdPercent,
  )
  const annualScenarioImpact = points.reduce((total, point) => total + point.scenarioImpact, 0)
  const baseSavings = points.reduce((total, point) => total + point.savings, 0)

  if (negativeMonths.length > 0) {
    alerts.push({
      level: "danger",
      message: `${negativeMonths.length} mes(es) proyectan ahorro negativo con el escenario actual.`,
    })
  }
  if (thresholdMonths.length > 0) {
    alerts.push({
      level: "warning",
      message: `En ${thresholdMonths.length} mes(es), los gastos proyectados superan el ${expenseThresholdPercent}% de los ingresos.`,
    })
  }
  if (annualScenarioImpact > 0 && baseSavings > 0 && annualScenarioImpact / baseSavings >= 0.2) {
    alerts.push({
      level: "warning",
      message: "Los escenarios activos reducen el ahorro anual base en 20% o más.",
    })
  }

  return alerts
}
