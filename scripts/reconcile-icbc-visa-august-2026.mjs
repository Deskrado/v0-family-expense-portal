import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  const path = join(process.cwd(), ".env")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    if (!process.env[key]) process.env[key] = rest.join("=")
  }
}

loadEnv()

const apply = process.argv.includes("--apply")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")

const CARD_ID = "aada3187-6ce7-4ada-aa5e-1fdb928b38c3"
const STATEMENT_ID = "fb878684-e509-40cc-9527-e12e033a66bd"
const OSDEPYM_TRANSACTION_ID = "f4e752fa-f966-438f-8e8f-8708970beeae"
const EXPECTED_TOTAL = 283011.87

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: statement, error: statementError } = await db
  .from("credit_card_statements")
  .select("*")
  .eq("id", STATEMENT_ID)
  .eq("credit_card_id", CARD_ID)
  .eq("year", 2026)
  .eq("month", 8)
  .single()
if (statementError) throw statementError

const { data: transactions, error: transactionsError } = await db
  .from("transactions")
  .select("id, description, amount, budgeted_amount, status, is_recurring, approved_at, approved_by, metadata, archived_at")
  .eq("credit_card_id", CARD_ID)
  .eq("type", "expense")
  .eq("payment_method", "credit")
  .gte("transaction_date", "2026-08-01")
  .lte("transaction_date", "2026-08-31")
if (transactionsError) throw transactionsError

const statementTransactions = (transactions || []).filter((transaction) =>
  !transaction.archived_at &&
  transaction.status !== "rejected" &&
  transaction.metadata?.source !== "credit_card_statement_payment_adjustment",
)
const calculatedTotal = Math.round(statementTransactions.reduce((total, transaction) => {
  const value = transaction.status === "approved"
    ? transaction.amount
    : transaction.budgeted_amount ?? transaction.amount
  return total + Number(value || 0)
}, 0) * 100) / 100
const osdepym = statementTransactions.find((transaction) => transaction.id === OSDEPYM_TRANSACTION_ID)

if (statement.status !== "paid" || Number(statement.paid_amount) !== EXPECTED_TOTAL) {
  throw new Error("La liquidación ya no coincide con el pago confirmado esperado; no se modifica nada")
}
if (calculatedTotal !== EXPECTED_TOTAL || statementTransactions.length !== 4) {
  throw new Error(`Los consumos activos ya no suman ${EXPECTED_TOTAL} o cambió su cantidad; no se modifica nada`)
}
if (!osdepym || osdepym.metadata?.source !== "recurring_card_debit") {
  throw new Error("No se encontró el débito automático de Osdepym esperado; no se modifica nada")
}

console.table(statementTransactions.map((transaction) => ({
  description: transaction.description,
  amount: transaction.amount,
  budgeted_amount: transaction.budgeted_amount,
  status: transaction.status,
  classification: transaction.metadata?.source,
})))
console.table([{
  statement: "ICBC Visa 2026-08",
  stored_expected: statement.expected_amount,
  calculated_expected: calculatedTotal,
  paid_amount: statement.paid_amount,
  stored_carryover: statement.carryover_balance,
}])

if (!apply) {
  console.log("Dry-run: no se modificó ninguna fila. Ejecuta con --apply para reconciliar la liquidación.")
  process.exit(0)
}

const correctedAt = new Date().toISOString()
const originalOsdepym = {
  status: osdepym.status,
  is_recurring: osdepym.is_recurring,
  approved_at: osdepym.approved_at || null,
  approved_by: osdepym.approved_by || null,
  metadata: osdepym.metadata,
}
const correctedMetadata = {
  ...(osdepym.metadata || {}),
  data_correction: {
    corrected_at: correctedAt,
    reason: "reconcile_paid_icbc_visa_statement_and_restore_automatic_debit",
    statement_id: STATEMENT_ID,
  },
}

const { error: osdepymUpdateError } = await db
  .from("transactions")
  .update({
    status: "approved",
    is_recurring: true,
    approved_at: statement.approved_at,
    approved_by: statement.approved_by,
    metadata: correctedMetadata,
  })
  .eq("id", OSDEPYM_TRANSACTION_ID)
  .eq("status", osdepym.status)
if (osdepymUpdateError) throw osdepymUpdateError

const { error: statementUpdateError } = await db
  .from("credit_card_statements")
  .update({
    expected_amount: EXPECTED_TOTAL,
    amount_due: EXPECTED_TOTAL,
    balance_delta: 0,
    carryover_balance: 0,
  })
  .eq("id", STATEMENT_ID)
  .eq("status", "paid")

if (statementUpdateError) {
  await db.from("transactions").update(originalOsdepym).eq("id", OSDEPYM_TRANSACTION_ID)
  throw statementUpdateError
}

console.log("Liquidación ICBC Visa agosto 2026 reconciliada: total y pago en $283.011,87, sin saldo arrastrado.")
