import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { toDateOnly } from "@/lib/date-only"
import type { CreditCard, CreditCardStatement, Transaction } from "@/lib/types"

type CardWithCurrency = CreditCard & {
  currency?: CreditCard["currency"] | null
}

type StatementWithRelations = CreditCardStatement & {
  credit_card?: CardWithCurrency | null
}

function getPeriodIndex(year: number, month: number) {
  return year * 12 + month
}

function validatePeriod(year: number, month: number) {
  return Number.isInteger(year) && Number.isInteger(month) && year >= 2000 && year <= 2100 && month >= 1 && month <= 12
}

function statementAmount(transaction: Pick<Transaction, "amount" | "budgeted_amount">) {
  return Number(transaction.budgeted_amount ?? transaction.amount ?? 0)
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100
}

function getStatementPaymentDate(card: Pick<CreditCard, "due_day">, year: number, month: number) {
  return toDateOnly(year, month, card.due_day || new Date(year, month, 0).getDate())
}

function buildStatementRow({
  card,
  existing,
  expectedAmount,
  previousBalance,
  userId,
  year,
  month,
}: {
  card: CardWithCurrency
  existing?: StatementWithRelations
  expectedAmount: number
  previousBalance: number
  userId: string
  year: number
  month: number
}) {
  if (existing?.status === "paid") return existing

  const paidAmount = Number(existing?.paid_amount || 0)
  const amountDue = previousBalance + expectedAmount
  const balanceDelta = amountDue - paidAmount

  return {
    id: existing?.id || null,
    user_id: existing?.user_id || userId,
    family_id: existing?.family_id ?? card.family_id ?? null,
    credit_card_id: card.id,
    year,
    month,
    currency_id: existing?.currency_id ?? card.currency_id ?? null,
    expected_amount: expectedAmount,
    previous_balance: previousBalance,
    amount_due: amountDue,
    paid_amount: paidAmount,
    balance_delta: balanceDelta,
    carryover_balance: balanceDelta,
    status: existing?.status || "pending",
    approved_at: existing?.approved_at || null,
    approved_by: existing?.approved_by || null,
    created_at: existing?.created_at,
    updated_at: existing?.updated_at,
    credit_card: card,
    currency: existing?.currency || card.currency || null,
  } satisfies CreditCardStatement
}

async function getLatestPreviousBalances(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cardIds: string[],
  year: number,
  month: number,
) {
  const balances = new Map<string, number>()
  if (cardIds.length === 0) return balances

  const { data, error } = await supabase
    .from("credit_card_statements")
    .select("credit_card_id, year, month, carryover_balance")
    .in("credit_card_id", cardIds)
    .order("year", { ascending: false })
    .order("month", { ascending: false })

  if (error) throw error

  const targetIndex = getPeriodIndex(year, month)
  for (const statement of data || []) {
    if (balances.has(statement.credit_card_id)) continue
    if (getPeriodIndex(Number(statement.year), Number(statement.month)) >= targetIndex) continue
    balances.set(statement.credit_card_id, Number(statement.carryover_balance || 0))
  }

  return balances
}

async function getExpectedAmounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  year: number,
  month: number,
  cardId?: string,
) {
  const startDate = toDateOnly(year, month, 1)
  const endDate = toDateOnly(year, month, 31)
  let query = supabase
    .from("transactions")
    .select("id, credit_card_id, amount, budgeted_amount, status")
    .is("archived_at", null)
    .eq("type", "expense")
    .eq("payment_method", "credit")
    .gte("transaction_date", startDate)
    .lte("transaction_date", endDate)

  if (cardId) query = query.eq("credit_card_id", cardId)

  const { data, error } = await query
  if (error) throw error

  const expectedByCard = new Map<string, number>()
  for (const transaction of data || []) {
    if (!transaction.credit_card_id || transaction.status === "rejected") continue
    expectedByCard.set(
      transaction.credit_card_id,
      (expectedByCard.get(transaction.credit_card_id) || 0) + statementAmount(transaction as Transaction),
    )
  }

  return expectedByCard
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const today = new Date()
    const year = Number(request.nextUrl.searchParams.get("year") || today.getFullYear())
    const month = Number(request.nextUrl.searchParams.get("month") || today.getMonth() + 1)
    if (!validatePeriod(year, month)) {
      return NextResponse.json({ error: "Periodo invalido" }, { status: 400 })
    }

    const { data: cards, error: cardsError } = await supabase
      .from("credit_cards")
      .select("*, currency:currencies(*)")
      .eq("is_active", true)
      .order("name")
    if (cardsError) throw cardsError

    const cardRows = (cards || []) as CardWithCurrency[]
    const cardIds = cardRows.map((card) => card.id)

    const { data: statements, error: statementsError } = await supabase
      .from("credit_card_statements")
      .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
      .eq("year", year)
      .eq("month", month)
    if (statementsError) throw statementsError

    const existingByCard = new Map(
      ((statements || []) as StatementWithRelations[]).map((statement) => [statement.credit_card_id, statement]),
    )
    const [expectedByCard, previousBalances] = await Promise.all([
      getExpectedAmounts(supabase, year, month),
      getLatestPreviousBalances(supabase, cardIds, year, month),
    ])

    const rows = cardRows.map((card) =>
      buildStatementRow({
        card,
        existing: existingByCard.get(card.id),
        expectedAmount: expectedByCard.get(card.id) || 0,
        previousBalance: previousBalances.get(card.id) || 0,
        userId: user.id,
        year,
        month,
      }),
    )

    return NextResponse.json({ statements: rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al obtener resumenes de tarjeta" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const creditCardId = String(body.creditCardId || "")
    const year = Number(body.year)
    const month = Number(body.month)
    const paidAmount = Number(body.paidAmount)

    if (!creditCardId) return NextResponse.json({ error: "Tarjeta requerida" }, { status: 400 })
    if (!validatePeriod(year, month)) return NextResponse.json({ error: "Periodo invalido" }, { status: 400 })
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return NextResponse.json({ error: "El monto pagado debe ser mayor o igual a 0" }, { status: 400 })
    }

    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("*, currency:currencies(*)")
      .eq("id", creditCardId)
      .single()
    if (cardError) throw cardError

    const [expectedByCard, previousBalances] = await Promise.all([
      getExpectedAmounts(supabase, year, month, creditCardId),
      getLatestPreviousBalances(supabase, [creditCardId], year, month),
    ])

    const expectedAmount = expectedByCard.get(creditCardId) || 0
    const previousBalance = previousBalances.get(creditCardId) || 0
    const amountDue = previousBalance + expectedAmount
    const balanceDelta = amountDue - paidAmount
    const now = new Date().toISOString()

    const payload = {
      user_id: user.id,
      family_id: card.family_id || null,
      credit_card_id: creditCardId,
      year,
      month,
      currency_id: card.currency_id || null,
      expected_amount: expectedAmount,
      previous_balance: previousBalance,
      amount_due: amountDue,
      paid_amount: paidAmount,
      balance_delta: balanceDelta,
      carryover_balance: balanceDelta,
      status: "paid",
      approved_at: now,
      approved_by: user.id,
    }

    const { data: statement, error: statementError } = await supabase
      .from("credit_card_statements")
      .upsert(payload, { onConflict: "credit_card_id,year,month" })
      .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
      .single()
    if (statementError) throw statementError

    const startDate = toDateOnly(year, month, 1)
    const endDate = toDateOnly(year, month, 31)
    const { data: pendingTransactions, error: pendingError } = await supabase
      .from("transactions")
      .select("id, amount, budgeted_amount")
      .is("archived_at", null)
      .eq("type", "expense")
      .eq("payment_method", "credit")
      .eq("credit_card_id", creditCardId)
      .eq("status", "pending")
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
    if (pendingError) throw pendingError

    const transactionsToApprove = pendingTransactions || []
    const targetCurrentExpense = Math.min(expectedAmount, paidAmount)
    let assignedCurrentExpense = 0

    for (let index = 0; index < transactionsToApprove.length; index += 1) {
      const transaction = transactionsToApprove[index]
      const budgetedAmount = statementAmount(transaction as Transaction)
      const isLast = index === transactionsToApprove.length - 1
      const amount = expectedAmount > 0
        ? isLast
          ? roundCurrency(targetCurrentExpense - assignedCurrentExpense)
          : roundCurrency((budgetedAmount / expectedAmount) * targetCurrentExpense)
        : budgetedAmount
      assignedCurrentExpense += amount

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          amount: Math.max(amount, 0.01),
          status: "approved",
          approved_at: now,
          approved_by: user.id,
        })
        .eq("id", transaction.id)
      if (updateError) throw updateError
    }

    const adjustmentAmount = roundCurrency(paidAmount - expectedAmount)
    if (adjustmentAmount > 0.009) {
      const metadata = {
        source: "credit_card_statement_payment_adjustment",
        credit_card_statement_id: statement.id,
        expected_amount: expectedAmount,
        paid_amount: paidAmount,
        previous_balance: previousBalance,
        adjustment_kind: paidAmount > amountDue ? "overpayment" : "previous_balance_payment",
      }

      const { data: existingAdjustments, error: existingAdjustmentError } = await supabase
        .from("transactions")
        .select("id")
        .is("archived_at", null)
        .eq("type", "expense")
        .eq("payment_method", "credit")
        .eq("credit_card_id", creditCardId)
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .contains("metadata", { source: "credit_card_statement_payment_adjustment", credit_card_statement_id: statement.id })
      if (existingAdjustmentError) throw existingAdjustmentError

      const adjustmentPayload = {
        user_id: user.id,
        family_id: card.family_id || null,
        created_by: user.id,
        description: `Ajuste pago ${card.name}`,
        amount: adjustmentAmount,
        budgeted_amount: adjustmentAmount,
        currency_id: card.currency_id || null,
        category_id: null,
        group_id: null,
        transaction_date: getStatementPaymentDate(card, year, month),
        type: "expense",
        is_recurring: false,
        payment_method: "credit",
        credit_card_id: creditCardId,
        credit_card_purchase_id: null,
        installment_number: null,
        status: "approved",
        approved_at: now,
        approved_by: user.id,
        notes: null,
        metadata,
      }

      if (existingAdjustments && existingAdjustments.length > 0) {
        const { error: adjustmentUpdateError } = await supabase
          .from("transactions")
          .update(adjustmentPayload)
          .eq("id", existingAdjustments[0].id)
        if (adjustmentUpdateError) throw adjustmentUpdateError
      } else {
        const { error: adjustmentInsertError } = await supabase
          .from("transactions")
          .insert(adjustmentPayload)
        if (adjustmentInsertError) throw adjustmentInsertError
      }
    }

    return NextResponse.json({ statement, approvedTransactions: pendingTransactions?.length || 0 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al confirmar pago de tarjeta" },
      { status: 500 },
    )
  }
}
