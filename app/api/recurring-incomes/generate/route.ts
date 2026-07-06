import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getMonthBounds, toDateOnly } from "@/lib/date-only"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const today = new Date()
    const month = Number(body.month || today.getMonth() + 1)
    const year = Number(body.year || today.getFullYear())
    const templateId = body.templateId ? String(body.templateId) : null

    if (month < 1 || month > 12 || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "Periodo invalido" }, { status: 400 })
    }

    let query = supabase
      .from("recurring_income_templates")
      .select("*")
      .eq("is_active", true)

    if (templateId) query = query.eq("id", templateId)

    const { data: templates, error: templatesError } = await query
    if (templatesError) throw templatesError

    let created = 0
    let skipped = 0
    const { start: monthStart, end: monthEnd } = getMonthBounds(year, month)

    for (const template of templates || []) {
      const transactionDate = toDateOnly(year, month, Number(template.day_of_month))
      if (transactionDate < template.start_date || (template.end_date && transactionDate > template.end_date)) {
        skipped += 1
        continue
      }

      // Match by month window rather than the exact computed date, so editing a
      // template's day_of_month after a transaction was already generated for
      // the period doesn't produce a duplicate (same fix already applied to
      // recurring expense generation).
      const { data: existing, error: existingError } = await supabase
        .from("transactions")
        .select("id")
        .eq("recurring_template_id", template.id)
        .gte("transaction_date", monthStart)
        .lte("transaction_date", monthEnd)
        .limit(1)
        .maybeSingle()

      if (existingError) throw existingError
      if (existing) {
        skipped += 1
        continue
      }

      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: user.id,
        family_id: template.family_id,
        created_by: user.id,
        description: template.description,
        amount: Number(template.amount),
        budgeted_amount: Number(template.amount),
        currency_id: template.currency_id,
        category_id: template.category_id,
        group_id: template.group_id,
        transaction_date: transactionDate,
        type: "income",
        is_recurring: true,
        payment_method: null,
        status: "pending",
        recurring_template_id: template.id,
        notes: template.notes,
        metadata: {
          source: "recurring_income_template",
          generated_at: new Date().toISOString(),
          generated_for: `${year}-${String(month).padStart(2, "0")}`,
        },
      })

      if (insertError) throw insertError

      await supabase
        .from("recurring_income_templates")
        .update({ last_generated_on: transactionDate })
        .eq("id", template.id)

      created += 1
    }

    return NextResponse.json({ ok: true, created, skipped })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al generar ingresos recurrentes" },
      { status: 500 },
    )
  }
}
