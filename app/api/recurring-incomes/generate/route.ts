import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { toDateOnly } from "@/lib/date-only"

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
    const monthStart = toDateOnly(year, month, 1)

    for (const template of templates || []) {
      const transactionDate = toDateOnly(year, month, Number(template.day_of_month))
      if (transactionDate < template.start_date || (template.end_date && transactionDate > template.end_date)) {
        skipped += 1
        continue
      }

      // The unique template/period identity makes this safe under concurrent
      // dashboard loads. Archived rows intentionally remain tombstones.
      const { data: inserted, error: insertError } = await supabase.from("transactions").upsert({
        user_id: template.user_id,
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
        recurrence_period: monthStart,
        notes: template.notes,
        metadata: {
          source: "recurring_income_template",
          generated_at: new Date().toISOString(),
          generated_for: `${year}-${String(month).padStart(2, "0")}`,
        },
      }, { onConflict: "recurring_template_id,recurrence_period", ignoreDuplicates: true }).select("id")

      if (insertError) throw insertError

      if (!inserted || inserted.length === 0) {
        skipped += 1
        continue
      }

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
