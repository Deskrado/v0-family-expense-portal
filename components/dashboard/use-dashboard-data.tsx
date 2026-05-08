"use client"

import { createClient } from "@/lib/supabase/client"
import { useEffect } from "react"
import useSWR, { mutate } from "swr"
import { useDashboard } from "./dashboard-context"
import type {
  Transaction,
  RecurringIncomeTemplate,
  Category,
  Group,
  Currency,
  CreditCard,
  CreditCardPurchase,
  Investment,
  BrokerConnection,
  BrokerPosition,
  PortfolioSnapshot,
  FxQuote,
  SavingsGoal,
  UserSettings,
  FamilyMember,
  FamilyMemberPermissions,
} from "@/lib/types"
import {
  applyTransactionVisibility,
  canApplyFamilyRestrictions,
  canSeeModule,
  getMaskedCategoryAmount,
} from "@/lib/family-visibility"

const supabase = createClient()
const generatedRecurringExpensePeriods = new Set<string>()
const materializedCreditCardPurchasePeriods = new Set<string>()

type FamilyVisibilityData = {
  membership: FamilyMember | null
  permissions: FamilyMemberPermissions | null
}

function getVisibilityScope(visibility: FamilyVisibilityData | undefined) {
  if (!visibility) return null
  if (!visibility.membership) return "personal"
  return [
    visibility.membership.family_id,
    visibility.membership.id,
    visibility.membership.role,
    visibility.permissions?.updated_at || "owner",
  ].join(":")
}

async function postJson(path: string, body?: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.error || "Error al ejecutar la acción")
  return payload as { created?: number }
}

function getPositionAccountKey(position: BrokerPosition) {
  const connection = position.account?.connection
  const provider = connection?.provider_id || "provider"
  const environment = connection?.environment || "environment"
  const symbol = position.instrument?.symbol || position.instrument?.provider_symbol || position.instrument_id || "instrument"
  const market = position.instrument?.market || "market"
  return `${provider}:${environment}:${symbol}:${market}:${position.source}`
}

function dedupeBrokerPositions(positions: BrokerPosition[]) {
  const latestByKey = new Map<string, BrokerPosition>()

  for (const position of positions) {
    const status = position.account?.connection?.status
    if (status === "disabled") continue

    const key = getPositionAccountKey(position)
    const current = latestByKey.get(key)
    if (!current) {
      latestByKey.set(key, position)
      continue
    }

    const currentObservedAt = new Date(current.observed_at || current.updated_at).getTime()
    const nextObservedAt = new Date(position.observed_at || position.updated_at).getTime()
    if (nextObservedAt > currentObservedAt) {
      latestByKey.set(key, position)
    }
  }

  return Array.from(latestByKey.values()).sort(
    (a, b) => new Date(b.observed_at).getTime() - new Date(a.observed_at).getTime(),
  )
}

export function useCurrencies() {
  return useSWR<Currency[]>("currencies", async () => {
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .eq("is_active", true)
      .order("code")
    if (error) throw error
    return data || []
  })
}

function useCurrentUserId() {
  const result = useSWR<string | null>("current-user-id", async () => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  })

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      mutate("current-user-id", session?.user?.id || null, { revalidate: false })
    })

    return () => subscription.unsubscribe()
  }, [])

  return result
}

export function useFamilyVisibility() {
  const { data: userId } = useCurrentUserId()

  return useSWR<FamilyVisibilityData>(
    userId === undefined ? null : ["family-visibility", userId],
    async () => {
      if (!userId) return { membership: null, permissions: null }

      const { data: memberships, error: membershipsError } = await supabase
        .from("family_members")
        .select("*, family:families(*)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("joined_at", { ascending: true })

      if (membershipsError) throw membershipsError

      const membership = ((memberships || []) as FamilyMember[])[0] || null
      if (!membership) return { membership: null, permissions: null }
      if (membership.role === "owner") return { membership, permissions: null }

      const { data: permissions, error: permissionsError } = await supabase
        .from("family_member_permissions")
        .select("*")
        .eq("family_member_id", membership.id)
        .maybeSingle()

      if (permissionsError) throw permissionsError

      return {
        membership,
        permissions: (permissions as FamilyMemberPermissions | null) || null,
      }
    },
  )
}

export function useCategories() {
  const { data: visibility } = useFamilyVisibility()
  const { data: userId } = useCurrentUserId()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<Category[]>(visibilityScope ? ["categories", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*, group:groups(*)")
      .eq("is_active", true)
      .is("archived_at", null)
      .order("name")
    if (error) throw error
    return data || []
  })

  const permissions = visibility?.permissions
  const membership = visibility?.membership
  const shouldFilter = canApplyFamilyRestrictions(membership, permissions) && Array.isArray(permissions?.visible_category_ids)
  const visibleCategories = shouldFilter
    ? (result.data || []).filter((category) =>
        permissions?.visible_category_ids?.includes(category.id) || category.user_id === userId
      )
    : result.data

  return { ...result, data: visibleCategories }
}

export function useGroups() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  return useSWR<Group[]>(visibilityScope ? ["groups", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .is("archived_at", null)
      .order("name")
    if (error) throw error
    return data || []
  })
}

export function useCreditCards() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  return useSWR<CreditCard[]>(visibilityScope ? ["credit-cards", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("credit_cards")
      .select("*, currency:currencies(*)")
      .order("name")
    if (error) throw error
    return data || []
  })
}

export function useCreditCardStatementTransactions(year: number, month: number) {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const endDate = new Date(year, month, 0).toISOString().split("T")[0]

  const result = useSWR<Transaction[]>(
    visibilityScope ? ["credit-card-statement-transactions", year, month, visibilityScope] : null,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          category:categories(*),
          group:groups(*),
          currency:currencies(*),
          credit_card:credit_cards(*)
        `)
        .is("archived_at", null)
        .eq("type", "expense")
        .eq("payment_method", "credit")
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
      if (error) throw error
      return data || []
    }
  )

  return {
    ...result,
    data: applyTransactionVisibility(result.data, visibility?.membership, visibility?.permissions),
  }
}

export function useMonthlyTransactions() {
  const { selectedMonth, selectedYear } = useDashboard()
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0]
  const key = visibilityScope ? ["transactions", selectedYear, selectedMonth, visibilityScope] : null

  const result = useSWR<Transaction[]>(
    key,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          category:categories(*),
          group:groups(*),
          currency:currencies(*),
          credit_card:credit_cards(*)
        `)
        .is("archived_at", null)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
      if (error) throw error
      return data || []
    }
  )

  useEffect(() => {
    if (!key) return
    const periodKey = `${selectedYear}-${selectedMonth}`
    if (generatedRecurringExpensePeriods.has(periodKey) && materializedCreditCardPurchasePeriods.has(periodKey)) return

    generatedRecurringExpensePeriods.add(periodKey)
    materializedCreditCardPurchasePeriods.add(periodKey)
    Promise.all([
      postJson("/api/recurring-expenses/generate", { year: selectedYear, month: selectedMonth }),
      postJson("/api/credit-card-purchases/materialize", { year: selectedYear, month: selectedMonth }),
    ])
      .then((responses) => {
        if (responses.some((response) => Number(response.created || 0) > 0)) {
          mutate(key)
          mutate((cacheKey) => Array.isArray(cacheKey) && cacheKey[0] === "credit-card-purchases")
        }
      })
      .catch(() => {
        generatedRecurringExpensePeriods.delete(periodKey)
        materializedCreditCardPurchasePeriods.delete(periodKey)
      })
  }, [visibilityScope, selectedMonth, selectedYear])

  return {
    ...result,
    data: applyTransactionVisibility(result.data, visibility?.membership, visibility?.permissions),
  }
}

export function useYearlyTransactions() {
  const { selectedYear } = useDashboard()
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const endDate = `${selectedYear}-12-31`

  const result = useSWR<Transaction[]>(
    visibilityScope ? ["transactions-year", selectedYear, visibilityScope] : null,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          category:categories(*),
          group:groups(*),
          currency:currencies(*),
          credit_card:credit_cards(*)
        `)
        .is("archived_at", null)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
      if (error) throw error
      return data || []
    }
  )

  return {
    ...result,
    data: applyTransactionVisibility(result.data, visibility?.membership, visibility?.permissions),
  }
}

export function useCreditCardPurchases() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<CreditCardPurchase[]>(visibilityScope ? ["credit-card-purchases", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("credit_card_purchases")
      .select(`
        *,
        credit_card:credit_cards(*, currency:currencies(*)),
        category:categories(*),
        transactions(id, installment_number)
      `)
      .eq("is_active", true)
      .order("start_date", { ascending: false })
    if (error) throw error
    return data || []
  })

  const membership = visibility?.membership
  const permissions = visibility?.permissions
  const shouldRestrict = canApplyFamilyRestrictions(membership, permissions)
  const shouldFilter = shouldRestrict && Array.isArray(permissions?.visible_category_ids)
  const visibleSet = new Set(permissions?.visible_category_ids || [])
  const data = !shouldRestrict
    ? result.data
    : (result.data || [])
        .filter((purchase) =>
          !shouldFilter ||
          !purchase.category_id ||
          visibleSet.has(purchase.category_id) ||
          purchase.category?.user_id === membership?.user_id
        )
        .map((purchase) => {
          const maskedAmount = getMaskedCategoryAmount(purchase.category_id, permissions)
          if (maskedAmount === null) return purchase
          return {
            ...purchase,
            installment_amount: maskedAmount,
            total_amount: maskedAmount * Number(purchase.total_installments || 1),
          }
        })

  return { ...result, data }
}

export function useInvestments() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<Investment[]>(visibilityScope ? ["investments", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("investments")
      .select("*, currency:currencies(*)")
      .order("start_date", { ascending: false })
    if (error) throw error
    return data || []
  })

  return {
    ...result,
    data: canSeeModule("investments", visibility?.membership, visibility?.permissions) ? result.data : [],
  }
}

export function useRecurringIncomeTemplates() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<RecurringIncomeTemplate[]>(visibilityScope ? ["recurring-income-templates", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("recurring_income_templates")
      .select("*, currency:currencies(*), category:categories(*), group:groups(*)")
      .order("day_of_month", { ascending: true })
    if (error) throw error
    return data || []
  })

  const membership = visibility?.membership
  const permissions = visibility?.permissions
  const shouldRestrict = canApplyFamilyRestrictions(membership, permissions)
  const shouldFilter = shouldRestrict && Array.isArray(permissions?.visible_category_ids)
  const visibleSet = new Set(permissions?.visible_category_ids || [])
  const data = !shouldRestrict
    ? result.data
    : (result.data || [])
        .filter((template) =>
          !shouldFilter ||
          !template.category_id ||
          visibleSet.has(template.category_id) ||
          template.category?.user_id === membership?.user_id
        )
        .map((template) => {
          const maskedAmount = getMaskedCategoryAmount(template.category_id, permissions)
          return maskedAmount === null ? template : { ...template, amount: maskedAmount }
        })

  return { ...result, data }
}

export function useBrokerConnections() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  return useSWR<BrokerConnection[]>(visibilityScope ? ["broker-connections", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("broker_connections")
      .select("*, provider:external_providers(*)")
      .order("created_at", { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function useBrokerPositions() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<BrokerPosition[]>(visibilityScope ? ["broker-positions", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("broker_positions")
      .select(`
        *,
        account:broker_accounts(*, connection:broker_connections(*)),
        instrument:market_instruments(*),
        currency:currencies(*)
    `)
      .order("observed_at", { ascending: false })
    if (error) throw error
    return dedupeBrokerPositions(data || [])
  })

  return {
    ...result,
    data: canSeeModule("investments", visibility?.membership, visibility?.permissions) ? result.data : [],
  }
}

export function usePortfolioSnapshots() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  const result = useSWR<PortfolioSnapshot[]>(visibilityScope ? ["portfolio-snapshots", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("*, account:broker_accounts(*), currency:currencies(*)")
      .order("snapshot_at", { ascending: false })
      .limit(24)
    if (error) throw error
    return data || []
  })

  return {
    ...result,
    data: canSeeModule("investments", visibility?.membership, visibility?.permissions) ? result.data : [],
  }
}

export function useFxQuotes() {
  return useSWR<FxQuote[]>("fx-quotes", async () => {
    const { data, error } = await supabase
      .from("fx_quotes")
      .select(`
        *,
        base_currency:currencies!fx_quotes_base_currency_id_fkey(*),
        quote_currency:currencies!fx_quotes_quote_currency_id_fkey(*)
      `)
      .order("observed_at", { ascending: false })
      .limit(60)
    if (error) throw error
    return data || []
  })
}

export function useSavingsGoals() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  return useSWR<SavingsGoal[]>(visibilityScope ? ["savings-goals", visibilityScope] : null, async () => {
    const { data, error } = await supabase
      .from("savings_goals")
      .select("*, currency:currencies(*)")
      .order("target_date", { ascending: true, nullsFirst: false })
    if (error) throw error
    return data || []
  })
}

export function useUserSettings() {
  const { data: visibility } = useFamilyVisibility()
  const visibilityScope = getVisibilityScope(visibility)
  return useSWR<UserSettings | null>(visibilityScope ? ["user-settings", visibilityScope] : null, async () => {
    const { data, error } = await (supabase as any)
      .rpc("effective_user_settings")
      .select("*, default_currency:currencies(*)")
      .maybeSingle()
    if (error) throw error
    return (data as UserSettings | null) || null
  })
}

export function useMonthlySummary() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  
  const summary = {
    totalIncome: 0,
    totalExpenses: 0,
    budgetedIncome: 0,
    budgetedExpenses: 0,
    savings: 0,
    savingsRate: 0,
  }

  if (transactions) {
    transactions.forEach((t) => {
      const actualAmount = t.status === "pending" || t.status === "rejected" ? 0 : Number(t.amount)
      const budgetedAmount = t.status === "rejected" ? 0 : Number(t.budgeted_amount || t.amount)
      if (t.type === "income") {
        summary.totalIncome += actualAmount
        summary.budgetedIncome += budgetedAmount
      } else {
        summary.totalExpenses += actualAmount
        summary.budgetedExpenses += budgetedAmount
      }
    })
    summary.savings = summary.totalIncome - summary.totalExpenses
    summary.savingsRate = summary.totalIncome > 0 
      ? (summary.savings / summary.totalIncome) * 100 
      : 0
  }

  return { summary, isLoading }
}

export function useGroupedTransactions() {
  const { data: transactions, isLoading } = useMonthlyTransactions()
  const { data: groups } = useGroups()

  const grouped: Record<string, {
    group: Group | null
    budgeted: number
    actual: number
    difference: number
    items: Transaction[]
  }> = {}

  if (transactions && groups) {
    // Initialize groups
    groups.forEach((g) => {
      grouped[g.id] = {
        group: g,
        budgeted: 0,
        actual: 0,
        difference: 0,
        items: [],
      }
    })
    grouped["ungrouped"] = {
      group: null,
      budgeted: 0,
      actual: 0,
      difference: 0,
      items: [],
    }

    // Group transactions
    transactions.forEach((t) => {
      const key = t.group_id || "ungrouped"
      if (!grouped[key]) {
        grouped[key] = {
          group: null,
          budgeted: 0,
          actual: 0,
          difference: 0,
          items: [],
        }
      }
      grouped[key].items.push(t)
      const amount = t.status === "pending" || t.status === "rejected" ? 0 : Number(t.amount)
      const budgeted = t.status === "rejected" ? 0 : Number(t.budgeted_amount || t.amount)
      if (t.type === "expense") {
        grouped[key].actual += amount
        grouped[key].budgeted += budgeted
      } else {
        grouped[key].actual -= amount
        grouped[key].budgeted -= budgeted
      }
    })

    // Calculate differences
    Object.values(grouped).forEach((g) => {
      g.difference = g.actual - g.budgeted
    })
  }

  return { grouped, isLoading }
}
