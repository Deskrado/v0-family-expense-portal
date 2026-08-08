import { describe, expect, it } from "vitest"
import { buildAnnualProjection } from "@/lib/projection-engine"
import type { ProjectionScenario, Transaction } from "@/lib/types"

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "transaction-id",
    user_id: "user-id",
    description: "Movimiento",
    amount: 100,
    budgeted_amount: null,
    currency_id: null,
    category_id: null,
    group_id: null,
    transaction_date: "2026-01-10",
    type: "expense",
    is_recurring: false,
    payment_method: "cash",
    credit_card_id: null,
    status: "approved",
    notes: null,
    created_at: "2026-01-10T00:00:00.000Z",
    ...overrides,
  }
}

describe("buildAnnualProjection", () => {
  it("genera una ventana retrospectiva que cruza el cambio de año", () => {
    const result = buildAnnualProjection({
      year: 2026,
      selectedMonth: 8,
      asOfYear: 2026,
      asOfMonth: 8,
      startYear: 2025,
      startMonth: 10,
      monthsAhead: 6,
    })

    expect(result.map(({ year, month }) => `${year}-${month}`)).toEqual([
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-1",
      "2026-2",
      "2026-3",
    ])
    expect(result.every((point) => point.periodType === "actual")).toBe(true)
  })

  it("no incorpora pendientes, recurrencias sintetizadas ni escenarios en meses históricos", () => {
    const recurring = transaction({
      id: "recurring",
      amount: 250,
      transaction_date: "2025-12-10",
      is_recurring: true,
    })
    const pending = transaction({
      id: "pending",
      amount: 400,
      transaction_date: "2026-01-12",
      status: "pending",
    })
    const scenario: ProjectionScenario = {
      id: "scenario",
      user_id: "user-id",
      family_id: null,
      name: "Escenario",
      description: null,
      is_active: true,
      created_at: "2025-01-01T00:00:00.000Z",
      items: [{
        id: "item",
        scenario_id: "scenario",
        name: "Extra",
        amount: 300,
        currency_id: null,
        frequency: "monthly",
        start_month: 1,
        start_year: 2026,
        end_month: 12,
        end_year: 2026,
        category_id: null,
        group_id: null,
        created_at: "2025-01-01T00:00:00.000Z",
      }],
    }

    const [january] = buildAnnualProjection({
      year: 2026,
      selectedMonth: 8,
      asOfYear: 2026,
      asOfMonth: 8,
      startYear: 2026,
      startMonth: 1,
      monthsAhead: 1,
      transactions: [recurring, pending],
      scenarios: [scenario],
    })

    expect(january.periodType).toBe("actual")
    expect(january.expenses).toBe(0)
    expect(january.recurringExpenses).toBe(0)
    expect(january.scenarioImpact).toBe(0)
    expect(january.simulatedExpenses).toBe(0)
  })

  it("mantiene las estimaciones y escenarios en meses futuros", () => {
    const recurring = transaction({
      id: "recurring",
      amount: 250,
      transaction_date: "2026-07-10",
      is_recurring: true,
    })
    const scenario: ProjectionScenario = {
      id: "scenario",
      user_id: "user-id",
      family_id: null,
      name: "Escenario",
      description: null,
      is_active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      items: [{
        id: "item",
        scenario_id: "scenario",
        name: "Extra",
        amount: 300,
        currency_id: null,
        frequency: "one_time",
        start_month: 9,
        start_year: 2026,
        end_month: 9,
        end_year: 2026,
        category_id: null,
        group_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      }],
    }

    const [september] = buildAnnualProjection({
      year: 2026,
      selectedMonth: 8,
      asOfYear: 2026,
      asOfMonth: 8,
      startYear: 2026,
      startMonth: 9,
      monthsAhead: 1,
      transactions: [recurring],
      scenarios: [scenario],
    })

    expect(september.periodType).toBe("projected")
    expect(september.recurringExpenses).toBe(250)
    expect(september.scenarioImpact).toBe(300)
    expect(september.simulatedExpenses).toBe(550)
  })
})
