import { describe, expect, it } from "vitest"
import { getInstallmentAmountInPeriod, hasInstallmentInPeriod } from "@/lib/credit-card-purchase-period"

describe("hasInstallmentInPeriod", () => {
  it("excludes completed purchases and includes purchases with a live installment in the selected month", () => {
    expect(hasInstallmentInPeriod({
      transactions: [
        { transaction_date: "2026-07-05", archived_at: null },
        { transaction_date: "2026-08-05", archived_at: null },
      ],
    }, 2026, 9)).toBe(false)

    expect(hasInstallmentInPeriod({
      transactions: [
        { transaction_date: "2026-08-05", archived_at: null },
        { transaction_date: "2026-09-05", archived_at: null },
      ],
    }, 2026, 9)).toBe(true)
  })

  it("ignores archived installments", () => {
    expect(hasInstallmentInPeriod({
      transactions: [{ transaction_date: "2026-09-05", archived_at: "2026-08-01T00:00:00Z" }],
    }, 2026, 9)).toBe(false)
  })

  it("returns the same approved or pending amount used by the statement", () => {
    expect(getInstallmentAmountInPeriod({
      transactions: [{
        transaction_date: "2026-09-05",
        amount: 40_000,
        budgeted_amount: 40_133.33,
        status: "approved",
      }],
    }, 2026, 9)).toBe(40_000)

    expect(getInstallmentAmountInPeriod({
      transactions: [{
        transaction_date: "2026-09-05",
        amount: 1,
        budgeted_amount: 40_133.33,
        status: "pending",
      }],
    }, 2026, 9)).toBe(40_133.33)
  })
})
