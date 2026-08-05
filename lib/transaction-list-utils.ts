import type { Transaction } from "@/lib/types"

type TransactionAmountData = Pick<Transaction, "amount" | "status">
type TransactionSearchData = Pick<Transaction, "description" | "amount" | "status">
type TransactionRecurrenceData = Pick<Transaction, "type" | "is_recurring" | "payment_method" | "credit_card_id">

export type TransactionRecurrenceKind = "normal" | "recurring" | "automatic_debit"

export function getTransactionRecurrenceKind(transaction: TransactionRecurrenceData): TransactionRecurrenceKind {
  if (!transaction.is_recurring) return "normal"

  return transaction.type === "expense" &&
    transaction.payment_method === "credit" &&
    Boolean(transaction.credit_card_id)
    ? "automatic_debit"
    : "recurring"
}

export function getTransactionActualAmount(transaction: TransactionAmountData) {
  const status = transaction.status || "approved"
  return status === "pending" || status === "rejected" ? 0 : Number(transaction.amount)
}

export function parseLocalizedAmount(value: string) {
  const compactValue = value.trim().replace(/\s/g, "")
  if (!/^[+-]?\d[\d.,]*$/.test(compactValue)) return null

  const sign = compactValue.startsWith("-") ? -1 : 1
  const unsignedValue = compactValue.replace(/^[+-]/, "")
  const lastDot = unsignedValue.lastIndexOf(".")
  const lastComma = unsignedValue.lastIndexOf(",")
  const separatorIndex = Math.max(lastDot, lastComma)

  if (separatorIndex === -1) {
    const parsedValue = Number(unsignedValue)
    return Number.isFinite(parsedValue) ? sign * parsedValue : null
  }

  const separator = unsignedValue[separatorIndex]
  const occurrences = unsignedValue.split(separator).length - 1
  const decimalLength = unsignedValue.length - separatorIndex - 1
  const usesThousandsSeparator =
    lastDot === -1 || lastComma === -1
      ? decimalLength === 3 && unsignedValue.split(separator).slice(1).every((part) => part.length === 3)
      : false

  const normalizedValue = usesThousandsSeparator
    ? unsignedValue.replace(/[.,]/g, "")
    : `${unsignedValue.slice(0, separatorIndex).replace(/[.,]/g, "")}.${unsignedValue.slice(separatorIndex + 1)}`

  if (occurrences > 1 && !usesThousandsSeparator && decimalLength === 0) return null

  const parsedValue = Number(normalizedValue)
  return Number.isFinite(parsedValue) ? sign * parsedValue : null
}

export function matchesTransactionSearch(transaction: TransactionSearchData, searchQuery: string) {
  const query = searchQuery.trim()
  if (!query) return true

  const searchedAmount = parseLocalizedAmount(query)
  if (searchedAmount !== null) {
    return Math.abs(getTransactionActualAmount(transaction) - searchedAmount) < 0.005
  }

  return transaction.description.toLocaleLowerCase("es").includes(query.toLocaleLowerCase("es"))
}
