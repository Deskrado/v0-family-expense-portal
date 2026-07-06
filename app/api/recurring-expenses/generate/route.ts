import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMonthBounds, toDateOnly } from "@/lib/date-only"

type RecurringExpenseRow = {
  id: string
  user_id: string
  family_id: string | null
  created_by: string | null
  description: string
  amount: number
  budgeted_amount: number | null
  currency_id: string | null
  category_id: string | null
  group_id: string | null
  transaction_date: string
  payment_method: "cash" | "debit" | "credit" | "transfer" | null
  is_recurring: boolean
  credit_card_id: string | null
  credit_card_purchase_id: string | null
  installment_number: number | null
  status: "pending" | "approved" | "rejected" | null
  notes: string | null
  metadata: Record<string, unknown> | null
  archived_at: string | null
}

function getDayFromDateOnly(value: string) {
  const day = Number(value.slice(8, 10))
  return Number.isFinite(day) && day > 0 ? day : 1
}

function getRecurringKey(transaction: RecurringExpenseRow) {
  const metadata = transaction.metadata || {}
  const seriesId = typeof metadata.recurring_series_id === "string" ? metadata.recurring_series_id : null
  if (seriesId) return `series:${seriesId}`

  return [
    transaction.description.trim().toLowerCase(),
    transaction.category_id || "no-category",
    transaction.group_id || "no-group",
    transaction.payment_method || "no-method",
    transaction.credit_card_id || "no-card",
    transaction.currency_id || "no-currency",
  ].join("|")
}

function getRecurrenceEndDate(transaction: RecurringExpenseRow) {
  const value = transaction.metadata?.recurrence_end_date
  return typeof value === "string" && value ? value : null
}

function cleanMetadata(metadata: Record<string, unknown> | null) {
  const {
    approved_amount_change: _approvedAmountChange,
    generated_at: _generatedAt,
    generated_for: _generatedFor,
    recurrence_index: _recurrenceIndex,
    ...rest
  } = metadata || {}

  return rest
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

    const { start: startDate, end: endDate } = getMonthBounds(year, month)

    const { data: expenses, error: expensesError } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .eq("type", "expense")
      .lte("transaction_date", endDate)
      .order("transaction_date", { ascending: true })

    if (expensesError) throw expensesError

    const rows = (expenses || []) as RecurringExpenseRow[]
    const existingTargetKeys = new Set(
      rows
        .filter((transaction) => transaction.transaction_date >= startDate && transaction.transaction_date <= endDate)
        .map(getRecurringKey),
    )

    const latestBeforeTarget = new Map<string, RecurringExpenseRow>()
    for (const transaction of rows) {
      if (transaction.archived_at) continue
      if (!transaction.is_recurring) continue
      if (transaction.status === "rejected") continue
      if (transaction.payment_method === "credit") continue
      if (transaction.credit_card_purchase_id || transaction.installment_number) continue
      if (transaction.transaction_date >= startDate) continue

      const key = getRecurringKey(transaction)
      const current = latestBeforeTarget.get(key)
      if (!current || transaction.transaction_date > current.transaction_date) {
        latestBeforeTarget.set(key, transaction)
      }
    }

    const inserts = Array.from(latestBeforeTarget.entries()).flatMap(([key, transaction]) => {
      if (existingTargetKeys.has(key)) return []

      const targetDate = toDateOnly(year, month, getDayFromDateOnly(transaction.transaction_date))
      const end = getRecurrenceEndDate(transaction)
      if (end && targetDate > end) return []

      const metadata = {
        ...cleanMetadata(transaction.metadata),
        source: "recurring_expense",
        scheduled_date: targetDate,
        generated_at: new Date().toISOString(),
        generated_for: `${year}-${String(month).padStart(2, "0")}`,
        generated_from_transaction_id: transaction.id,
      }

      return [{
        user_id: user.id,
        family_id: transaction.family_id,
        created_by: user.id,
        description: transaction.description,
        amount: Number(transaction.amount),
        budgeted_amount: Number(transaction.budgeted_amount || transaction.amount),
        currency_id: transaction.currency_id,
        category_id: transaction.category_id,
        group_id: transaction.group_id,
        transaction_date: targetDate,
        type: "expense",
        is_recurring: true,
        payment_method: transaction.payment_method,
        credit_card_id: null,
        status: "pending",
        approved_at: null,
        approved_by: null,
        notes: transaction.notes,
        metadata,
      }]
    })

    if (inserts.length > 0) {
      const { error: insertError } = await supabase.from("transactions").insert(inserts)
      if (insertError) throw insertError
    }

    return NextResponse.json({ ok: true, created: inserts.length, skipped: latestBeforeTarget.size - inserts.length })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al generar gastos recurrentes" },
      { status: 500 },
    )
  }
}
