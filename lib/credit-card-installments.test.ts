import { describe, expect, it } from "vitest"
import { buildCreditCardInstallmentTransactions } from "@/lib/credit-card-installments"
import type { CreditCard } from "@/lib/types"

const bbvaMastercard = {
  id: "card-bbva-mastercard",
  user_id: "purchase-owner",
  family_id: "family-1",
  name: "BBVA Mastercard",
  brand: "mastercard",
  closing_day: 2,
  due_day: 13,
  currency_id: "ars",
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
} as CreditCard

describe("buildCreditCardInstallmentTransactions", () => {
  it("genera la cuota 3 de BBVA en agosto con cierre 2 y vencimiento 13", () => {
    const installments = buildCreditCardInstallmentTransactions({
      purchase: {
        id: "purchase-1",
        user_id: "purchase-owner",
        family_id: "family-1",
        credit_card_id: bbvaMastercard.id,
        description: "Zapatillas Lilu",
        installment_amount: 67032.33,
        total_installments: 3,
        start_date: "2026-05-03",
        category_id: "clothing",
        currency_id: "ars",
      },
      card: bbvaMastercard,
      actorUserId: "family-member-materializer",
      generatedAt: "2026-07-06T12:00:00.000Z",
    })

    expect(installments.map((installment) => installment.transaction_date)).toEqual([
      "2026-06-13",
      "2026-07-13",
      "2026-08-13",
    ])
    expect(installments[2]).toMatchObject({
      amount: 67032.33,
      installment_number: 3,
      user_id: "purchase-owner",
      family_id: "family-1",
      created_by: "family-member-materializer",
    })
  })
})
