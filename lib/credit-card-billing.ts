import type { CreditCard } from "@/lib/types"
import { toDateOnly as formatDateOnly } from "@/lib/date-only"

type CreditCardBillingConfig = Pick<CreditCard, "closing_day" | "due_day"> | null | undefined
export const CREDIT_CARD_PAYMENT_APPROVAL_START_DATE = "2026-06-01"

function parseDateOnly(value: string) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return { year, month, day }
}

export function addMonthsToDateOnly(value: string, monthsToAdd: number) {
  const parsed = parseDateOnly(value)
  if (!parsed) return value

  const target = new Date(parsed.year, parsed.month - 1 + monthsToAdd, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1

  return formatDateOnly(year, month, parsed.day)
}

export function getCreditCardStatementDueDate(purchaseDate: string, card: CreditCardBillingConfig) {
  const parsed = parseDateOnly(purchaseDate)
  if (!parsed || !card?.closing_day) return purchaseDate

  const closingDay = Math.max(1, Math.min(Number(card.closing_day) || 1, 31))
  const dueDay = Math.max(1, Math.min(Number(card.due_day) || 1, 31))

  // The purchase belongs to the statement that closes this month if it happened
  // on/before the closing day, otherwise it rolls into next month's statement.
  const monthsToClose = parsed.day <= closingDay ? 0 : 1
  // The due date falls in the same month as the close if due_day is after the
  // closing day (e.g. closes the 2nd, due the 13th); otherwise it falls the
  // following month (e.g. closes the 25th, due the 10th).
  const monthsFromCloseToDue = dueDay > closingDay ? 0 : 1
  const monthsToDue = monthsToClose + monthsFromCloseToDue

  const target = new Date(parsed.year, parsed.month - 1 + monthsToDue, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1

  return formatDateOnly(year, month, dueDay)
}

export function getCreditCardInstallmentDueDate(
  purchaseDate: string,
  card: CreditCardBillingConfig,
  installmentIndex: number,
) {
  const firstDueDate = getCreditCardStatementDueDate(purchaseDate, card)
  return addMonthsToDateOnly(firstDueDate, installmentIndex)
}

export function requiresCreditCardPaymentApproval(dueDate: string) {
  return dueDate >= CREDIT_CARD_PAYMENT_APPROVAL_START_DATE
}

export function formatDateOnlyForDisplay(value: string) {
  const parsed = parseDateOnly(value)
  if (!parsed) return value
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`
}
