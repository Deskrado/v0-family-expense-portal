import type { CreditCard } from "@/lib/types"
import { getCreditCardInstallmentDueDate, requiresCreditCardPaymentApproval } from "@/lib/credit-card-billing"

type InstallmentSource = {
  id: string
  user_id: string
  family_id?: string | null
  credit_card_id: string
  description: string
  installment_amount: number
  total_installments: number
  start_date: string
  category_id?: string | null
  currency_id?: string | null
  notes?: string | null
}

type BuildInstallmentsOptions = {
  purchase: InstallmentSource
  card: CreditCard | null | undefined
  groupId?: string | null
  actorUserId: string
  generatedFor?: string
  generatedAt?: string
}

export function buildCreditCardInstallmentTransactions({
  purchase,
  card,
  groupId = null,
  actorUserId,
  generatedFor,
  generatedAt = new Date().toISOString(),
}: BuildInstallmentsOptions) {
  return Array.from({ length: Number(purchase.total_installments) || 0 }, (_, index) => {
    const installmentNumber = index + 1
    const dueDate = getCreditCardInstallmentDueDate(purchase.start_date, card, index)
    const requiresApproval = requiresCreditCardPaymentApproval(dueDate)

    return {
      user_id: purchase.user_id,
      family_id: purchase.family_id || null,
      created_by: actorUserId,
      description: purchase.description,
      amount: Number(purchase.installment_amount),
      budgeted_amount: Number(purchase.installment_amount),
      currency_id: purchase.currency_id || card?.currency_id || null,
      category_id: purchase.category_id || null,
      group_id: groupId,
      transaction_date: dueDate,
      type: "expense" as const,
      is_recurring: false,
      payment_method: "credit" as const,
      credit_card_id: purchase.credit_card_id,
      credit_card_purchase_id: purchase.id,
      installment_number: installmentNumber,
      status: requiresApproval ? "pending" as const : "approved" as const,
      approved_at: requiresApproval ? null : generatedAt,
      approved_by: requiresApproval ? null : actorUserId,
      notes: purchase.notes || null,
      metadata: {
        source: "credit_card_installment",
        purchase_date: purchase.start_date,
        billing_date: dueDate,
        billing_rule: "credit_card_statement_due",
        total_installments: purchase.total_installments,
        generated_at: generatedAt,
        ...(generatedFor ? { generated_for: generatedFor } : {}),
      },
    }
  })
}
