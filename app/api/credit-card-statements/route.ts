import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { toDateOnly } from "@/lib/date-only"
import {
  allocateStatementPayment,
  calculateStatementBalances,
  calculateStatementPaymentApplication,
  CREDIT_CARD_STATEMENT_ADJUSTMENT_SOURCE,
  getApplicablePreviousBalance,
  getStatementTransactionAmount,
  isStatementPaymentAdjustment,
  roundStatementCurrency,
} from "@/lib/credit-card-statement-calculations"
import type { CreditCard, CreditCardStatement } from "@/lib/types"

type CardWithCurrency = CreditCard & {
  currency?: CreditCard["currency"] | null
}

type StatementWithRelations = CreditCardStatement & {
  credit_card?: CardWithCurrency | null
}

function validatePeriod(year: number, month: number) {
  return Number.isInteger(year) && Number.isInteger(month) && year >= 2000 && year <= 2100 && month >= 1 && month <= 12
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
  const { amountDue, balanceDelta, carryoverBalance } = calculateStatementBalances({
    expectedAmount,
    previousBalance,
    paidAmount,
  })

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
    carryover_balance: carryoverBalance,
    status: existing?.status || "pending",
    approved_at: existing?.approved_at || null,
    approved_by: existing?.approved_by || null,
    created_at: existing?.created_at,
    updated_at: existing?.updated_at,
    credit_card: card,
    currency: existing?.currency || card.currency || null,
  } satisfies CreditCardStatement
}

async function getPreviousBalances(
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
    .eq("status", "paid")
    .order("year", { ascending: false })
    .order("month", { ascending: false })

  if (error) throw error

  for (const statement of data || []) {
    if (balances.has(statement.credit_card_id)) continue
    if (statement.year > year || (statement.year === year && statement.month >= month)) continue
    balances.set(statement.credit_card_id, getApplicablePreviousBalance({
      carryoverBalance: Number(statement.carryover_balance || 0),
      statementYear: Number(statement.year),
      statementMonth: Number(statement.month),
      targetYear: year,
      targetMonth: month,
    }))
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
    .select("id, credit_card_id, amount, budgeted_amount, status, metadata")
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
    if (isStatementPaymentAdjustment(transaction)) continue
    expectedByCard.set(
      transaction.credit_card_id,
      roundStatementCurrency(
        (expectedByCard.get(transaction.credit_card_id) || 0) + getStatementTransactionAmount(transaction),
      ),
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
      getPreviousBalances(supabase, cardIds, year, month),
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

    const { data: existingStatement, error: existingStatementError } = await supabase
      .from("credit_card_statements")
      .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
      .eq("credit_card_id", creditCardId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()
    if (existingStatementError) throw existingStatementError
    if (existingStatement?.status === "paid") {
      return NextResponse.json({ statement: existingStatement, approvedTransactions: 0 })
    }

    const [expectedByCard, previousBalances] = await Promise.all([
      getExpectedAmounts(supabase, year, month, creditCardId),
      getPreviousBalances(supabase, [creditCardId], year, month),
    ])

    const expectedAmount = expectedByCard.get(creditCardId) || 0
    const previousBalance = previousBalances.get(creditCardId) || 0
    const { amountDue, balanceDelta, carryoverBalance, targetCurrentExpense, adjustmentAmount } = calculateStatementPaymentApplication({
      expectedAmount,
      previousBalance,
      paidAmount,
    })
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
      carryover_balance: carryoverBalance,
      status: "pending",
      approved_at: null,
      approved_by: null,
    }

    let pendingStatement = existingStatement
    if (pendingStatement) {
      const { data, error } = await supabase
        .from("credit_card_statements")
        .update(payload)
        .eq("id", pendingStatement.id)
        .eq("status", "pending")
        .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
        .maybeSingle()
      if (error) throw error
      pendingStatement = data
    } else {
      const { data, error } = await supabase
        .from("credit_card_statements")
        .insert(payload)
        .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
        .single()

      if (error?.code === "23505") {
        const { data: concurrentStatement, error: concurrentError } = await supabase
          .from("credit_card_statements")
          .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
          .eq("credit_card_id", creditCardId)
          .eq("year", year)
          .eq("month", month)
          .single()
        if (concurrentError) throw concurrentError
        if (concurrentStatement.status === "paid") {
          return NextResponse.json({ statement: concurrentStatement, approvedTransactions: 0 })
        }
        pendingStatement = concurrentStatement
      } else {
        if (error) throw error
        pendingStatement = data
      }
    }

    if (!pendingStatement) {
      const { data: concurrentStatement, error: concurrentError } = await supabase
        .from("credit_card_statements")
        .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
        .eq("credit_card_id", creditCardId)
        .eq("year", year)
        .eq("month", month)
        .single()
      if (concurrentError) throw concurrentError
      if (concurrentStatement.status === "paid") {
        return NextResponse.json({ statement: concurrentStatement, approvedTransactions: 0 })
      }
      pendingStatement = concurrentStatement
    }

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
    const pendingExpectedAmount = roundStatementCurrency(
      transactionsToApprove.reduce((sum, transaction) => sum + getStatementTransactionAmount(transaction), 0),
    )
    const alreadyApprovedAmount = Math.max(0, roundStatementCurrency(expectedAmount - pendingExpectedAmount))
    const targetPendingExpense = Math.max(
      0,
      roundStatementCurrency(Math.min(pendingExpectedAmount, targetCurrentExpense - alreadyApprovedAmount)),
    )
    const allocations = allocateStatementPayment(
      transactionsToApprove.map((transaction) => ({
        id: transaction.id,
        weight: getStatementTransactionAmount(transaction),
      })),
      targetPendingExpense,
    )
    let approvedTransactions = 0

    for (const transaction of transactionsToApprove) {
      const amount = allocations.get(transaction.id) || 0
      // The schema requires positive transaction amounts. A zero payment must not
      // approve consumptions with a fabricated $0.01 amount.
      if (amount <= 0) continue

      const { data: approvedTransaction, error: updateError } = await supabase
        .from("transactions")
        .update({
          amount,
          status: "approved",
          approved_at: now,
          approved_by: user.id,
        })
        .eq("id", transaction.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle()
      if (updateError) throw updateError
      if (approvedTransaction) approvedTransactions += 1
    }

    if (adjustmentAmount > 0.009) {
      const metadata = {
        source: CREDIT_CARD_STATEMENT_ADJUSTMENT_SOURCE,
        credit_card_statement_id: pendingStatement.id,
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
        .contains("metadata", { source: CREDIT_CARD_STATEMENT_ADJUSTMENT_SOURCE, credit_card_statement_id: pendingStatement.id })
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
          .upsert({ id: pendingStatement.id, ...adjustmentPayload }, { onConflict: "id" })
        if (adjustmentInsertError) throw adjustmentInsertError
      }
    }

    const { data: statement, error: paidStatementError } = await supabase
      .from("credit_card_statements")
      .update({ status: "paid", approved_at: now, approved_by: user.id })
      .eq("id", pendingStatement.id)
      .eq("status", "pending")
      .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
      .maybeSingle()
    if (paidStatementError) throw paidStatementError

    if (!statement) {
      const { data: concurrentPaidStatement, error: concurrentPaidError } = await supabase
        .from("credit_card_statements")
        .select("*, credit_card:credit_cards(*, currency:currencies(*)), currency:currencies(*)")
        .eq("id", pendingStatement.id)
        .eq("status", "paid")
        .single()
      if (concurrentPaidError) throw concurrentPaidError
      return NextResponse.json({ statement: concurrentPaidStatement, approvedTransactions: 0 })
    }

    return NextResponse.json({ statement, approvedTransactions })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al confirmar pago de tarjeta" },
      { status: 500 },
    )
  }
}
