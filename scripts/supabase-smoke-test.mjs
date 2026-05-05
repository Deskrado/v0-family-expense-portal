import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

function loadEnv() {
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    process.env[key] ||= rest.join("=")
  }
}

async function main() {
  loadEnv()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) throw new Error("Faltan variables Supabase para smoke test")

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  const email = `codex-smoke-${Date.now()}@example.com`
  const password = `Codex-${Date.now()}-Smoke!`
  const ids = {}
  let userId = null

    const cleanup = async () => {
    const order = [
      "transactions",
      "recurring_income_templates",
      "credit_card_purchases",
      "credit_cards",
      "categories",
      "groups",
      "investments",
      "savings_goals",
      "family_members",
      "families",
      "user_settings",
    ]
    for (const table of order) {
      if (ids[table]) await admin.from(table).delete().eq("id", ids[table])
    }
    if (ids.profiles) await admin.from("profiles").delete().eq("id", ids.profiles)
    if (userId) await admin.auth.admin.deleteUser(userId)
  }

  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    if (created.error) throw created.error
    userId = created.data.user.id

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const signed = await client.auth.signInWithPassword({ email, password })
    if (signed.error) throw signed.error

    const currencies = await client.from("currencies").select("*").limit(1)
    if (currencies.error) throw currencies.error
    const currencyId = currencies.data?.[0]?.id
    if (!currencyId) throw new Error("No hay monedas visibles")

    const settings = await client.from("user_settings").upsert({
      user_id: userId,
      default_currency_id: currencyId,
      monthly_savings_target: 100,
      annual_savings_target: 1200,
      initial_balance: 10,
      default_payment_method: "debit",
      default_transaction_type: "expense",
      dashboard_months_ahead: 6,
      week_starts_on: 1,
      date_format: "dd/MM/yyyy",
      number_format: "es-AR",
      compact_mode: false,
      show_archived: false,
      notify_card_due_days: 3,
      notify_budget_threshold: 80,
      auto_create_card_transactions: false,
    }, { onConflict: "user_id" }).select("*").single()
    if (settings.error) throw settings.error
    ids.user_settings = settings.data.id

    const profile = await client.from("profiles").upsert({
      id: userId,
      full_name: "Smoke User",
      phone: "123456",
      locale: "es-AR",
    }).select("*").single()
    if (profile.error) throw profile.error
    ids.profiles = profile.data.id

    const family = await client.from("families").insert({
      name: "Smoke Familia",
      description: "Smoke test",
      default_currency_id: currencyId,
      timezone: "America/Argentina/Buenos_Aires",
      month_start_day: 1,
      created_by: userId,
    }).select("*").single()
    if (family.error) throw family.error
    ids.families = family.data.id

    const member = await client.from("family_members").insert({
      family_id: family.data.id,
      user_id: userId,
      role: "owner",
      is_active: true,
    }).select("*").single()
    if (member.error) throw member.error
    ids.family_members = member.data.id

    const group = await client.from("groups").insert({ user_id: userId, name: "Smoke Grupo", color: "#2563eb" }).select("*").single()
    if (group.error) throw group.error
    ids.groups = group.data.id

    const category = await client.from("categories").insert({ user_id: userId, name: "Smoke Categoria", type: "expense", color: "#16a34a", group_id: group.data.id }).select("*").single()
    if (category.error) throw category.error
    ids.categories = category.data.id

    const card = await client.from("credit_cards").insert({ user_id: userId, name: "Smoke Visa", brand: "Visa", last_four: "1234", credit_limit: 1000, closing_day: 20, due_day: 10, currency_id: currencyId, is_active: true }).select("*").single()
    if (card.error) throw card.error
    ids.credit_cards = card.data.id

    const purchase = await client.from("credit_card_purchases").insert({ user_id: userId, credit_card_id: card.data.id, description: "Smoke Cuotas", total_amount: 300, installment_amount: 100, total_installments: 3, current_installment: 1, start_date: new Date().toISOString().slice(0, 10), category_id: category.data.id, is_active: true }).select("*").single()
    if (purchase.error) throw purchase.error
    ids.credit_card_purchases = purchase.data.id

    const transaction = await client.from("transactions").insert({ user_id: userId, description: "Smoke Gasto", amount: 100, budgeted_amount: 120, currency_id: currencyId, category_id: category.data.id, group_id: group.data.id, transaction_date: new Date().toISOString().slice(0, 10), type: "expense", is_recurring: false, payment_method: "credit", credit_card_id: card.data.id }).select("*").single()
    if (transaction.error) throw transaction.error
    ids.transactions = transaction.data.id

    const recurringTemplate = await client.from("recurring_income_templates").insert({ user_id: userId, description: "Smoke Sueldo", amount: 1000, currency_id: currencyId, category_id: category.data.id, group_id: group.data.id, day_of_month: 1, start_date: new Date().toISOString().slice(0, 10), is_active: true }).select("*").single()
    if (recurringTemplate.error) throw recurringTemplate.error
    ids.recurring_income_templates = recurringTemplate.data.id

    const investment = await client.from("investments").insert({ user_id: userId, name: "Smoke PF", type: "plazo_fijo", initial_amount: 1000, current_value: 1100, currency_id: currencyId, start_date: new Date().toISOString().slice(0, 10), is_active: true }).select("*").single()
    if (investment.error) throw investment.error
    ids.investments = investment.data.id

    const goal = await client.from("savings_goals").insert({ user_id: userId, name: "Smoke Meta", target_amount: 1000, current_amount: 100, currency_id: currencyId, monthly_target: 50, is_completed: false }).select("*").single()
    if (goal.error) throw goal.error
    ids.savings_goals = goal.data.id

    const checks = await Promise.all([
      client.from("transactions").select("*, category:categories(*), group:groups(*), currency:currencies(*), credit_card:credit_cards(*)").eq("id", ids.transactions).single(),
      client.from("recurring_income_templates").select("*, currency:currencies(*), category:categories(*), group:groups(*)").eq("id", ids.recurring_income_templates).single(),
      client.from("credit_cards").select("*, currency:currencies(*)").eq("id", ids.credit_cards).single(),
      client.from("credit_card_purchases").select("*, credit_card:credit_cards(*, currency:currencies(*)), category:categories(*)").eq("id", ids.credit_card_purchases).single(),
      client.from("categories").select("*, group:groups(*)").eq("id", ids.categories).single(),
      client.from("investments").select("*, currency:currencies(*)").eq("id", ids.investments).single(),
      client.from("savings_goals").select("*, currency:currencies(*)").eq("id", ids.savings_goals).single(),
      client.from("user_settings").select("*, default_currency:currencies(*)").eq("id", ids.user_settings).single(),
      client.from("profiles").select("*").eq("id", ids.profiles).single(),
      client.from("family_members").select("*, family:families(*, default_currency:currencies(*))").eq("id", ids.family_members).single(),
    ])
    for (const check of checks) if (check.error) throw check.error

    console.log("Smoke test OK:", Object.keys(ids).join(", "))
  } finally {
    await cleanup()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
