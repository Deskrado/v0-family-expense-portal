"use client"

import { createClient } from "@/lib/supabase/client"
import useSWR from "swr"
import { useDashboard } from "./dashboard-context"
import type {
  Transaction,
  Category,
  Group,
  Currency,
  CreditCard,
  CreditCardPurchase,
  Investment,
  SavingsGoal,
  UserSettings,
} from "@/lib/types"

const supabase = createClient()

export function useCurrencies() {
  return useSWR<Currency[]>("currencies", async () => {
    const { data, error } = await supabase
      .from("currencies")
      .select("*")
      .order("code")
    if (error) throw error
    return data || []
  })
}

export function useCategories() {
  return useSWR<Category[]>("categories", async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("*, group:groups(*)")
      .order("name")
    if (error) throw error
    return data || []
  })
}

export function useGroups() {
  return useSWR<Group[]>("groups", async () => {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("name")
    if (error) throw error
    return data || []
  })
}

export function useCreditCards() {
  return useSWR<CreditCard[]>("credit-cards", async () => {
    const { data, error } = await supabase
      .from("credit_cards")
      .select("*, currency:currencies(*)")
      .order("name")
    if (error) throw error
    return data || []
  })
}

export function useMonthlyTransactions() {
  const { selectedMonth, selectedYear } = useDashboard()
  const startDate = new Date(selectedYear, selectedMonth - 1, 1).toISOString().split("T")[0]
  const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0]

  return useSWR<Transaction[]>(
    `transactions-${selectedYear}-${selectedMonth}`,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          category:categories(*),
          group:groups(*),
          currency:currencies(*)
        `)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
      if (error) throw error
      return data || []
    }
  )
}

export function useYearlyTransactions() {
  const { selectedYear } = useDashboard()
  const startDate = `${selectedYear}-01-01`
  const endDate = `${selectedYear}-12-31`

  return useSWR<Transaction[]>(
    `transactions-year-${selectedYear}`,
    async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          category:categories(*),
          group:groups(*),
          currency:currencies(*)
        `)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .order("transaction_date", { ascending: false })
      if (error) throw error
      return data || []
    }
  )
}

export function useCreditCardPurchases() {
  return useSWR<CreditCardPurchase[]>("credit-card-purchases", async () => {
    const { data, error } = await supabase
      .from("credit_card_purchases")
      .select(`
        *,
        credit_card:credit_cards(*, currency:currencies(*)),
        category:categories(*)
      `)
      .eq("is_active", true)
      .order("start_date", { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function useInvestments() {
  return useSWR<Investment[]>("investments", async () => {
    const { data, error } = await supabase
      .from("investments")
      .select("*, currency:currencies(*)")
      .order("start_date", { ascending: false })
    if (error) throw error
    return data || []
  })
}

export function useSavingsGoals() {
  return useSWR<SavingsGoal[]>("savings-goals", async () => {
    const { data, error } = await supabase
      .from("savings_goals")
      .select("*, currency:currencies(*)")
      .order("target_date", { ascending: true, nullsFirst: false })
    if (error) throw error
    return data || []
  })
}

export function useUserSettings() {
  return useSWR<UserSettings | null>("user-settings", async () => {
    const { data, error } = await supabase
      .from("user_settings")
      .select("*, default_currency:currencies(*)")
      .maybeSingle()
    if (error) throw error
    return data || null
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
      if (t.type === "income") {
        summary.totalIncome += Number(t.amount)
        summary.budgetedIncome += Number(t.budgeted_amount || t.amount)
      } else {
        summary.totalExpenses += Number(t.amount)
        summary.budgetedExpenses += Number(t.budgeted_amount || t.amount)
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
      const amount = Number(t.amount)
      const budgeted = Number(t.budgeted_amount || t.amount)
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
