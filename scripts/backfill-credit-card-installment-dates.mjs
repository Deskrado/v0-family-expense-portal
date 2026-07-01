import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

// Recomputes transaction_date / metadata.billing_date for pending credit-card
// installment transactions using the corrected getCreditCardStatementDueDate
// formula (lib/credit-card-billing.ts, fixed in commit 1c415b2). Materialized
// installments are write-once, so rows created before that fix are stuck with
// a stale date. This script only touches transactions that are:
//   - payment_method = "credit", type = "expense"
//   - status = "pending" (never touches approved/paid rows -> settled statements)
//   - archived_at IS NULL
//   - linked to a credit_card_purchase_id (i.e. materialized installments)
//
// Usage:
//   node scripts/backfill-credit-card-installment-dates.mjs           # dry run, prints diff
//   node scripts/backfill-credit-card-installment-dates.mjs --apply   # writes changes

function loadEnv() {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    process.env[key] ||= rest.join("=")
  }
}

function parseDateOnly(value) {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return { year, month, day }
}

function clampDay(year, month, day) {
  const lastDay = new Date(year, month, 0).getDate()
  return Math.min(day, lastDay)
}

function formatDateOnly(year, month, day) {
  return [year, String(month).padStart(2, "0"), String(day).padStart(2, "0")].join("-")
}

function addMonthsToDateOnly(value, monthsToAdd) {
  const parsed = parseDateOnly(value)
  if (!parsed) return value
  const target = new Date(parsed.year, parsed.month - 1 + monthsToAdd, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1
  const day = clampDay(year, month, parsed.day)
  return formatDateOnly(year, month, day)
}

// Mirrors the fixed lib/credit-card-billing.ts logic.
function getCreditCardStatementDueDate(purchaseDate, card) {
  const parsed = parseDateOnly(purchaseDate)
  if (!parsed || !card?.closing_day) return purchaseDate

  const closingDay = Math.max(1, Math.min(Number(card.closing_day) || 1, 31))
  const dueDay = Math.max(1, Math.min(Number(card.due_day) || 1, 31))

  const monthsToClose = parsed.day <= closingDay ? 0 : 1
  const monthsFromCloseToDue = dueDay > closingDay ? 0 : 1
  const monthsToDue = monthsToClose + monthsFromCloseToDue

  const target = new Date(parsed.year, parsed.month - 1 + monthsToDue, 1)
  const year = target.getFullYear()
  const month = target.getMonth() + 1
  const day = clampDay(year, month, dueDay)

  return formatDateOnly(year, month, day)
}

function getCreditCardInstallmentDueDate(purchaseDate, card, installmentIndex) {
  const firstDueDate = getCreditCardStatementDueDate(purchaseDate, card)
  return addMonthsToDateOnly(firstDueDate, installmentIndex)
}

async function main() {
  loadEnv()
  const apply = process.argv.includes("--apply")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error("Faltan variables Supabase (URL / SERVICE_ROLE_KEY) en .env")

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: transactions, error: txError } = await admin
    .from("transactions")
    .select("id, description, transaction_date, installment_number, credit_card_id, credit_card_purchase_id, metadata")
    .eq("payment_method", "credit")
    .eq("type", "expense")
    .eq("status", "pending")
    .is("archived_at", null)
    .not("credit_card_purchase_id", "is", null)
  if (txError) throw txError

  if (!transactions || transactions.length === 0) {
    console.log("No hay transacciones pendientes de cuotas de tarjeta para revisar.")
    return
  }

  const purchaseIds = [...new Set(transactions.map((t) => t.credit_card_purchase_id))]
  const { data: purchases, error: purchaseError } = await admin
    .from("credit_card_purchases")
    .select("id, start_date, credit_card_id")
    .in("id", purchaseIds)
  if (purchaseError) throw purchaseError
  const purchaseById = new Map((purchases || []).map((p) => [p.id, p]))

  const cardIds = [...new Set((purchases || []).map((p) => p.credit_card_id))]
  const { data: cards, error: cardError } = await admin
    .from("credit_cards")
    .select("id, name, closing_day, due_day")
    .in("id", cardIds)
  if (cardError) throw cardError
  const cardById = new Map((cards || []).map((c) => [c.id, c]))

  const diffs = []
  for (const transaction of transactions) {
    const purchase = purchaseById.get(transaction.credit_card_purchase_id)
    if (!purchase) continue
    const card = cardById.get(purchase.credit_card_id)
    if (!card) continue

    const installmentIndex = Math.max(0, Number(transaction.installment_number || 1) - 1)
    const correctDate = getCreditCardInstallmentDueDate(purchase.start_date, card, installmentIndex)

    if (correctDate !== transaction.transaction_date) {
      diffs.push({ transaction, purchase, card, correctDate })
    }
  }

  if (diffs.length === 0) {
    console.log("Todas las fechas de cuotas pendientes ya están correctas. Nada para hacer.")
    return
  }

  console.log(`${diffs.length} transacción(es) con fecha desactualizada:\n`)
  for (const { transaction, card, correctDate } of diffs) {
    console.log(
      `  [${card.name}] "${transaction.description}" cuota ${transaction.installment_number}: ` +
        `${transaction.transaction_date} -> ${correctDate}`,
    )
  }

  if (!apply) {
    console.log("\nDry run (no se escribió nada). Volvé a correr con --apply para aplicar los cambios.")
    return
  }

  console.log("\nAplicando cambios...")
  for (const { transaction, correctDate } of diffs) {
    const metadata = { ...(transaction.metadata || {}), billing_date: correctDate, billing_date_backfilled_at: new Date().toISOString() }
    const { error: updateError } = await admin
      .from("transactions")
      .update({ transaction_date: correctDate, metadata })
      .eq("id", transaction.id)
    if (updateError) throw updateError
  }
  console.log(`Listo. ${diffs.length} transacción(es) actualizada(s).`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
