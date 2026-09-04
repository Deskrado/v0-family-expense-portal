import type { MonthlyClosure } from "@/lib/types"

type Period = {
  year: number
  month: number
}

type MonthCashBalancesInput = Period & {
  initialBalance: number
  monthlySavings: number
  closures?: MonthlyClosure[]
}

export function getPreviousPeriod({ year, month }: Period): Period {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 }
}

export function findMonthlyClosure(
  closures: MonthlyClosure[] | undefined,
  { year, month }: Period,
) {
  return (closures || []).find((closure) => closure.year === year && closure.month === month) || null
}

export function getPreviousMonthClosingBalance({
  year,
  month,
  initialBalance,
  closures,
}: Period & { initialBalance: number; closures?: MonthlyClosure[] }) {
  const previousClosure = findMonthlyClosure(closures, getPreviousPeriod({ year, month }))
  return previousClosure ? Number(previousClosure.cash_total || 0) : initialBalance
}

export function getMonthCashBalances({
  year,
  month,
  initialBalance,
  monthlySavings,
  closures,
}: MonthCashBalancesInput) {
  const selectedClosure = findMonthlyClosure(closures, { year, month })

  if (selectedClosure) {
    const finalBalance = Number(selectedClosure.cash_total || 0)
    return {
      initialBalance: finalBalance - Number(selectedClosure.savings_total || 0),
      finalBalance,
    }
  }

  const openingBalance = getPreviousMonthClosingBalance({ year, month, initialBalance, closures })
  return {
    initialBalance: openingBalance,
    finalBalance: openingBalance + monthlySavings,
  }
}
