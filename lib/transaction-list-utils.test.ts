import { describe, expect, it } from "vitest"
import {
  getTransactionActualAmount,
  matchesTransactionSearch,
  parseLocalizedAmount,
} from "@/lib/transaction-list-utils"

describe("transaction list helpers", () => {
  it.each([
    ["9000", 9000],
    ["9.000", 9000],
    ["9000,50", 9000.5],
    ["9.000,50", 9000.5],
    ["9,000.50", 9000.5],
  ])("parses %s as an amount", (query, expected) => {
    expect(parseLocalizedAmount(query)).toBe(expected)
  })

  it("searches text only in the description", () => {
    const transaction = { description: "Gastos varios", amount: 9000, status: "approved" as const }

    expect(matchesTransactionSearch(transaction, "varios")).toBe(true)
    expect(matchesTransactionSearch(transaction, "compras")).toBe(false)
  })

  it("searches numeric queries by the displayed real amount", () => {
    const approved = { description: "Compra", amount: 9000, status: "approved" as const }
    const pending = { description: "Compra", amount: 9000, status: "pending" as const }

    expect(matchesTransactionSearch(approved, "9.000")).toBe(true)
    expect(matchesTransactionSearch(pending, "9.000")).toBe(false)
    expect(matchesTransactionSearch(pending, "0")).toBe(true)
    expect(getTransactionActualAmount(pending)).toBe(0)
  })
})
