import { getMonthIndexFromDateOnly, getYearFromDateOnly } from "@/lib/date-only"

type PurchaseWithInstallmentDates = {
  transactions?: Array<{
    transaction_date: string
    archived_at?: string | null
    amount?: number | null
    budgeted_amount?: number | null
    status?: string | null
  }>
}

function isInPeriod(transactionDate: string, year: number, month: number) {
  return getYearFromDateOnly(transactionDate) === year &&
    getMonthIndexFromDateOnly(transactionDate) === month - 1
}

export function hasInstallmentInPeriod(
  purchase: PurchaseWithInstallmentDates,
  year: number,
  month: number,
) {
  return (purchase.transactions || []).some((transaction) =>
    !transaction.archived_at &&
    isInPeriod(transaction.transaction_date, year, month),
  )
}

export function getInstallmentAmountInPeriod(
  purchase: PurchaseWithInstallmentDates,
  year: number,
  month: number,
) {
  const transaction = (purchase.transactions || []).find((candidate) =>
    !candidate.archived_at && isInPeriod(candidate.transaction_date, year, month),
  )
  if (!transaction) return null

  const value = transaction.status === "approved"
    ? transaction.amount
    : transaction.budgeted_amount ?? transaction.amount
  return Number(value ?? 0)
}
