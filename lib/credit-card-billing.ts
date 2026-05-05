import type { CreditCard } from "@/lib/types"

type CreditCardBillingConfig = Pick<CreditCard, "closing_day" | "due_day"> | null | undefined

function parseDateOnly(value: string) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  return { year, month, day }
}

function formatDateOnly(year: number, month: number, day: number) {
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-")
}

function clampDay(year: number, month: number, day: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return Math.min(day, lastDay)
}

export function addMonthsToDateOnly(value: string, monthsToAdd: number) {
  const parsed = parseDateOnly(value)
  if (!parsed) return value

  const target = new Date(parsed.year, parsed.month - 1 + monthsToAdd, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1
  const day = clampDay(year, month, parsed.day)

  return formatDateOnly(year, month, day)
}

export function getCreditCardStatementDueDate(purchaseDate: string, card: CreditCardBillingConfig) {
  const parsed = parseDateOnly(purchaseDate)
  if (!parsed || !card?.closing_day) return purchaseDate

  const closingDay = Math.max(1, Math.min(Number(card.closing_day) || 1, 31))
  const dueDay = Math.max(1, Math.min(Number(card.due_day) || 1, 31))
  const monthsToDue = parsed.day <= closingDay ? 1 : 2
  const target = new Date(parsed.year, parsed.month - 1 + monthsToDue, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1
  const day = clampDay(year, month, dueDay)

  return formatDateOnly(year, month, day)
}

export function getCreditCardInstallmentDueDate(
  purchaseDate: string,
  card: CreditCardBillingConfig,
  installmentIndex: number,
) {
  const firstDueDate = getCreditCardStatementDueDate(purchaseDate, card)
  return addMonthsToDateOnly(firstDueDate, installmentIndex)
}

export function formatDateOnlyForDisplay(value: string) {
  const parsed = parseDateOnly(value)
  if (!parsed) return value
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month).padStart(2, "0")}/${parsed.year}`
}
