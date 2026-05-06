import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCreditCardInstallmentDueDate } from "@/lib/credit-card-billing"
import type { CreditCard, CreditCardPurchase } from "@/lib/types"

type PurchaseWithRelations = CreditCardPurchase & {
  credit_card: CreditCard | null
  category?: { group_id: string | null } | null
}

function toDateOnly(year: number, month: number, day: number) {
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const today = new Date()
    const month = Number(body.month || today.getMonth() + 1)
    const year = Number(body.year || today.getFullYear())

    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Periodo inválido" }, { status: 400 })
    }

    const startDate = toDateOnly(year, month, 1)
    const endDate = toDateOnly(year, month, 31)

    const { data: purchases, error: purchasesError } = await supabase
      .from("credit_card_purchases")
      .select("*, credit_card:credit_cards(*), category:categories(group_id)")
      .eq("user_id", user.id)
      .eq("is_active", true)

    if (purchasesError) throw purchasesError

    const purchaseRows = (purchases || []) as PurchaseWithRelations[]
    const purchaseIds = purchaseRows.map((purchase) => purchase.id)
    const existingKeys = new Set<string>()

    if (purchaseIds.length > 0) {
      const { data: existingTransactions, error: existingError } = await supabase
        .from("transactions")
        .select("credit_card_purchase_id, installment_number")
        .in("credit_card_purchase_id", purchaseIds)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .is("archived_at", null)

      if (existingError) throw existingError

      for (const transaction of existingTransactions || []) {
        existingKeys.add(`${transaction.credit_card_purchase_id}:${transaction.installment_number}`)
      }
    }

    const inserts = []
    for (const purchase of purchaseRows) {
      for (let index = 0; index < Number(purchase.total_installments || 0); index += 1) {
        const installmentNumber = index + 1
        const dueDate = getCreditCardInstallmentDueDate(purchase.start_date, purchase.credit_card, index)
        if (dueDate < startDate || dueDate > endDate) continue
        if (existingKeys.has(`${purchase.id}:${installmentNumber}`)) continue

        inserts.push({
          user_id: user.id,
          family_id: purchase.family_id || null,
          created_by: user.id,
          description: purchase.description,
          amount: Number(purchase.installment_amount),
          budgeted_amount: Number(purchase.installment_amount),
          currency_id: purchase.currency_id || purchase.credit_card?.currency_id || null,
          category_id: purchase.category_id,
          group_id: purchase.category?.group_id || null,
          transaction_date: dueDate,
          type: "expense",
          is_recurring: false,
          payment_method: "credit",
          credit_card_id: purchase.credit_card_id,
          credit_card_purchase_id: purchase.id,
          installment_number: installmentNumber,
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: user.id,
          notes: purchase.notes,
          metadata: {
            source: "credit_card_installment",
            purchase_date: purchase.start_date,
            billing_date: dueDate,
            billing_rule: "credit_card_statement_due",
            total_installments: purchase.total_installments,
            generated_at: new Date().toISOString(),
            generated_for: `${year}-${String(month).padStart(2, "0")}`,
          },
        })
      }
    }

    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from("transactions").insert(inserts)
      if (insertError) throw insertError
    }

    return NextResponse.json({ ok: true, created: inserts.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al materializar cuotas" },
      { status: 500 },
    )
  }
}
