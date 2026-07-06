import { createHash } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCreditCardStatementDueDate } from "@/lib/credit-card-billing"
import { toDateOnly } from "@/lib/date-only"

type RecurringExpenseRow = {
  id: string
  user_id: string
  family_id: string | null
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
  recurring_series_id: string | null
  recurrence_period: string | null
  credit_card: { closing_day: number | null; due_day: number | null } | null
}

const PAGE_SIZE = 1000

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

function getDay(value: string) {
  const day = Number(value.slice(8, 10))
  return Number.isFinite(day) && day > 0 ? day : 1
}

function metadataDate(transaction: RecurringExpenseRow, key: "purchase_date" | "scheduled_date") {
  const value = transaction.metadata?.[key]
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function getOccurrenceDate(transaction: RecurringExpenseRow) {
  return transaction.payment_method === "credit"
    ? metadataDate(transaction, "purchase_date") || transaction.transaction_date
    : metadataDate(transaction, "scheduled_date") || transaction.transaction_date
}

function getPeriod(transaction: RecurringExpenseRow) {
  return transaction.recurrence_period || monthStart(getOccurrenceDate(transaction))
}

function getLegacyKey(transaction: RecurringExpenseRow) {
  return [
    transaction.family_id || `user:${transaction.user_id}`,
    transaction.description.trim().toLowerCase(),
    transaction.category_id || "no-category",
    transaction.group_id || "no-group",
    transaction.payment_method || "no-method",
    transaction.credit_card_id || "no-card",
    transaction.currency_id || "no-currency",
  ].join("|")
}

function deterministicSeriesId(key: string) {
  const hex = createHash("sha256").update(`family-expense-recurring:${key}`).digest("hex").slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function getSeriesId(transaction: RecurringExpenseRow) {
  const metadataId = transaction.metadata?.recurring_series_id
  if (transaction.recurring_series_id) return transaction.recurring_series_id
  if (typeof metadataId === "string" && /^[0-9a-f-]{36}$/i.test(metadataId)) return metadataId
  return deterministicSeriesId(getLegacyKey(transaction))
}

function getEndDate(transaction: RecurringExpenseRow) {
  const value = transaction.metadata?.recurrence_end_date
  return typeof value === "string" && value ? value : null
}

function cleanMetadata(metadata: Record<string, unknown> | null) {
  const {
    approved_amount_change: _approvedAmountChange,
    generated_at: _generatedAt,
    generated_for: _generatedFor,
    generated_from_transaction_id: _generatedFrom,
    recurrence_index: _recurrenceIndex,
    purchase_date: _purchaseDate,
    billing_date: _billingDate,
    scheduled_date: _scheduledDate,
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

    // RLS supplies the family boundary. Deliberately do not filter by user_id:
    // any family member may trigger materialization, but ownership remains with
    // the member who created the series.
    const rows: RecurringExpenseRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, credit_card:credit_cards(closing_day, due_day)")
        .eq("type", "expense")
        .eq("is_recurring", true)
        .order("transaction_date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      rows.push(...((data || []) as unknown as RecurringExpenseRow[]))
      if (!data || data.length < PAGE_SIZE) break
    }
    const rowsBySeries = new Map<string, RecurringExpenseRow[]>()
    for (const row of rows) {
      if (row.credit_card_purchase_id || row.installment_number) continue
      const seriesId = getSeriesId(row)
      rowsBySeries.set(seriesId, [...(rowsBySeries.get(seriesId) || []), row])
    }

    const requestedPeriod = toDateOnly(year, month, 1)
    const previousDate = new Date(year, month - 2, 1)
    const previousPeriod = toDateOnly(previousDate.getFullYear(), previousDate.getMonth() + 1, 1)
    const inserts: Record<string, unknown>[] = []

    for (const [seriesId, seriesRows] of rowsBySeries) {
      const activeRows = seriesRows.filter((row) => !row.archived_at && row.status !== "rejected")
      if (activeRows.length === 0) continue

      const periods = activeRows.some((row) => row.payment_method === "credit")
        ? [previousPeriod, requestedPeriod]
        : [requestedPeriod]

      for (const period of periods) {
        // Archived/rejected rows are tombstones too: once a period existed it
        // must not silently reappear on a later dashboard load.
        if (seriesRows.some((row) => getPeriod(row) === period)) continue

        const source = [...activeRows]
          .filter((row) => getPeriod(row) < period)
          .sort((a, b) => getPeriod(b).localeCompare(getPeriod(a)))[0]
        if (!source) continue

        const occurrenceDate = toDateOnly(Number(period.slice(0, 4)), Number(period.slice(5, 7)), getDay(getOccurrenceDate(source)))
        const endDate = getEndDate(source)
        if (endDate && occurrenceDate > endDate) continue

        const isCardDebit = source.payment_method === "credit" && source.credit_card_id
        const transactionDate = isCardDebit
          ? getCreditCardStatementDueDate(occurrenceDate, source.credit_card)
          : occurrenceDate
        const metadata = {
          ...cleanMetadata(source.metadata),
          source: isCardDebit ? "recurring_card_debit" : "recurring_expense",
          recurring_series_id: seriesId,
          ...(isCardDebit
            ? { purchase_date: occurrenceDate, billing_date: transactionDate, billing_rule: "credit_card_statement_due" }
            : { scheduled_date: occurrenceDate }),
          generated_at: new Date().toISOString(),
          generated_for: period.slice(0, 7),
          generated_from_transaction_id: source.id,
        }

        inserts.push({
          user_id: source.user_id,
          family_id: source.family_id,
          created_by: user.id,
          description: source.description,
          amount: Number(source.amount),
          budgeted_amount: Number(source.budgeted_amount ?? source.amount),
          currency_id: source.currency_id,
          category_id: source.category_id,
          group_id: source.group_id,
          transaction_date: transactionDate,
          type: "expense",
          is_recurring: true,
          payment_method: source.payment_method,
          credit_card_id: source.credit_card_id,
          status: "pending",
          approved_at: null,
          approved_by: null,
          notes: source.notes,
          recurring_series_id: seriesId,
          recurrence_period: period,
          metadata,
        })
      }
    }

    let created = 0
    if (inserts.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("transactions")
        .upsert(inserts, { onConflict: "recurring_series_id,recurrence_period", ignoreDuplicates: true })
        .select("id")
      if (insertError) throw insertError
      created = inserted?.length || 0
    }

    return NextResponse.json({ ok: true, created, skipped: Math.max(0, inserts.length - created) })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al generar gastos recurrentes" },
      { status: 500 },
    )
  }
}
