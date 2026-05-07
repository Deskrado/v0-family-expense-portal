import type { FamilyMember, FamilyMemberPermissions, Transaction } from "@/lib/types"

export const FAMILY_MODULES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transactions", label: "Transacciones" },
  { id: "credit_cards", label: "Tarjetas" },
  { id: "categories", label: "Categorías" },
  { id: "savings", label: "Ahorros" },
  { id: "projections", label: "Proyección" },
  { id: "investments", label: "Inversiones" },
  { id: "settings", label: "Configuración" },
] as const

export const ALL_FAMILY_MODULE_IDS = FAMILY_MODULES.map((module) => module.id)

export function canApplyFamilyRestrictions(
  membership: FamilyMember | null | undefined,
  permissions: FamilyMemberPermissions | null | undefined,
) {
  return Boolean(membership && permissions && membership.role !== "owner")
}

export function canSeeModule(
  moduleId: string,
  membership: FamilyMember | null | undefined,
  permissions: FamilyMemberPermissions | null | undefined,
) {
  if (moduleId === "settings" && membership && !["owner", "admin"].includes(membership.role)) return false
  if (!canApplyFamilyRestrictions(membership, permissions)) return true
  if (moduleId === "investments" && permissions?.show_investments === false) return false
  return (permissions?.allowed_modules || []).includes(moduleId)
}

export function getMaskedCategoryAmount(
  categoryId: string | null | undefined,
  permissions: FamilyMemberPermissions | null | undefined,
) {
  if (!categoryId || !permissions?.masked_category_amounts) return null
  const value = permissions.masked_category_amounts[categoryId]
  if (value === undefined || value === null || value === "") return null

  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

export function applyTransactionVisibility(
  transactions: Transaction[] | undefined,
  membership: FamilyMember | null | undefined,
  permissions: FamilyMemberPermissions | null | undefined,
) {
  if (!transactions) return []
  if (!canApplyFamilyRestrictions(membership, permissions)) return transactions

  const visibleCategoryIds = permissions?.visible_category_ids
  const shouldFilterCategories = Array.isArray(visibleCategoryIds)
  const visibleSet = new Set(visibleCategoryIds || [])

  return transactions
    .filter((transaction) => {
      if (!shouldFilterCategories) return true
      if (!transaction.category_id) return true
      return visibleSet.has(transaction.category_id)
    })
    .map((transaction) => {
      const maskedAmount = getMaskedCategoryAmount(transaction.category_id, permissions)
      if (maskedAmount === null) return transaction

      return {
        ...transaction,
        amount: maskedAmount,
        budgeted_amount: maskedAmount,
        metadata: {
          ...(transaction.metadata || {}),
          visibility_masked: true,
        },
      }
    })
}
